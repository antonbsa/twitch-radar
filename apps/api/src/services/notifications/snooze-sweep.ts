import type { Database } from "../../db"
import { logger } from "../../logger"
import type { NotificationJobMessage } from "../../types"

// Bounds the sweep the same way the other scheduled jobs bound theirs
// (ADR 0036): a run that can't clear the backlog just leaves the remainder
// for the next minutely pass.
const MAX_SNOOZES_PER_RUN = 30

/**
 * Fires due snooze reminders (ADR 0048). For each `pending` row whose
 * `fire_at` has passed, re-checks the broadcaster's *current* `channel_state`
 * — not the state at the time the original notification was sent — and only
 * re-sends if the channel is still live in the snoozed category. A stream
 * that ended or moved on is marked `expired` with no re-send.
 *
 * A re-send stages a fresh `notification_deliveries` row with trigger
 * `snooze_reminder` and goes through the same `NOTIFICATION_JOBS_QUEUE` /
 * `deliverNotification` pipeline as a normal match (ADR 0034), so it gets the
 * same audit trail and per-device send/revoke behavior.
 *
 * Runs from the default (minutely) cron branch rather than its own schedule
 * — see ADR 0048's note on the account-wide cron trigger cap.
 */
export async function sweepNotificationSnoozes(
  db: Database,
  queue: Queue<NotificationJobMessage>,
): Promise<void> {
  const now = new Date().toISOString()
  const due = await db.notificationSnoozes.findDue(now, MAX_SNOOZES_PER_RUN)
  if (due.length === 0) return

  let fired = 0
  let expired = 0

  // ADR 0044: language is per-recipient, so batch-load it up front the same
  // way matchAndCreateDeliveries does.
  const languageByUserId = await db.users.findLanguagesByIds(
    due.map((snooze) => snooze.user_id),
  )

  for (const snooze of due) {
    const channelState = await db.channelState.findByBroadcasterUserId(
      snooze.broadcaster_user_id,
    )
    const stillCurrent =
      channelState?.is_live === true &&
      channelState.category_id === snooze.category_id

    if (!stillCurrent) {
      await db.notificationSnoozes.markExpired(snooze.id)
      expired += 1
      continue
    }

    const [monitored] = await db.monitoredChannels.findByBroadcasterUserIds([
      snooze.broadcaster_user_id,
    ])
    // Fallback to the raw id rather than English prose (ADR 0044): these
    // values flow into `params` verbatim into every language's template, so
    // a fake-English fallback here would leak untranslated text.
    const broadcasterName =
      monitored?.broadcaster_display_name ??
      monitored?.broadcaster_login ??
      snooze.broadcaster_user_id
    const categoryName = channelState.category_name ?? snooze.category_id

    const delivery = await db.notificationDeliveries.insertPendingIfNew({
      userId: snooze.user_id,
      broadcasterUserId: snooze.broadcaster_user_id,
      categoryId: snooze.category_id,
      triggerType: "snooze_reminder",
      eventsubMessageId: null,
      streamId: channelState.stream_id,
      now,
    })

    if (delivery?.status === "pending") {
      await queue.send({
        deliveryId: delivery.id,
        userId: snooze.user_id,
        payload: {
          titleKey: "notification.snooze_reminder.title",
          bodyKey: "notification.snooze_reminder.body",
          params: { broadcasterName, categoryName },
          lang: languageByUserId.get(snooze.user_id) ?? "en",
          url: `/channels?broadcaster=${snooze.broadcaster_user_id}`,
          deliveryId: delivery.id,
        },
      })
    }

    await db.notificationSnoozes.markFired(snooze.id)
    fired += 1
  }

  logger.info("Notification snooze sweep completed", {
    attempted: due.length,
    fired,
    expired,
  })
}
