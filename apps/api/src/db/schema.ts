import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  twitchUserId: text("twitch_user_id").notNull().unique(),
  twitchLogin: text("twitch_login").notNull(),
  twitchDisplayName: text("twitch_display_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastFollowSyncAt: text("last_follow_sync_at"),
  // UI/notification language preference (ADR 0044): "en" | "pt-BR" | "es",
  // validated at the API layer (zod), not a DB CHECK constraint.
  language: text("language").notNull().default("en"),
  // ADR 0054: set means no notification of any kind reaches the user.
  notificationsPausedAt: text("notifications_paused_at"),
})

export const twitchTokens = sqliteTable(
  "twitch_tokens",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    scopes: text("scopes").notNull(),
    updatedAt: text("updated_at").notNull(),
    // Set when a refresh attempt fails permanently (invalid/revoked refresh
    // token) — the user must reconnect their Twitch account. Cleared by the
    // next successful token upsert (re-auth or successful refresh).
    refreshFailedAt: text("refresh_failed_at"),
    // Last time the access token was confirmed valid: set when it is issued
    // (login or refresh) and by the hourly /oauth2/validate sweep.
    validatedAt: text("validated_at"),
    // Atomic claim on a token refresh: a caller owns the refresh until this
    // time passes or it clears the claim (cleared by the refresh upsert).
    refreshLockedUntil: text("refresh_locked_until"),
  },
  (table) => [index("idx_twitch_tokens_expires_at").on(table.expiresAt)],
)

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [index("idx_push_subscriptions_user_id").on(table.userId)],
)

export const followedChannels = sqliteTable(
  "followed_channels",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    broadcasterLogin: text("broadcaster_login").notNull(),
    broadcasterDisplayName: text("broadcaster_display_name").notNull(),
    broadcasterProfileImageUrl: text("broadcaster_profile_image_url"),
    followedAt: text("followed_at"),
    lastSyncedAt: text("last_synced_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.broadcasterUserId] }),
    index("idx_followed_channels_broadcaster_user_id").on(
      table.broadcasterUserId,
    ),
  ],
)

export const monitoredChannels = sqliteTable("monitored_channels", {
  broadcasterUserId: text("broadcaster_user_id").primaryKey(),
  broadcasterLogin: text("broadcaster_login"),
  broadcasterDisplayName: text("broadcaster_display_name"),
  monitorReason: text("monitor_reason").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  disabledAt: text("disabled_at"),
})

export const eventsubSubscriptions = sqliteTable(
  "eventsub_subscriptions",
  {
    id: text("id").primaryKey(),
    twitchSubscriptionId: text("twitch_subscription_id").unique(),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    eventType: text("event_type").notNull(),
    eventVersion: text("event_version").notNull(),
    status: text("status").notNull(),
    callbackUrl: text("callback_url").notNull(),
    secretVersion: text("secret_version").notNull(),
    // Consecutive creation failures since the last success; drives the
    // backoff schedule and the pending → failed cutoff (ADR 0049).
    failureCount: integer("failure_count").notNull().default(0),
    // Earliest time findPending will pick this row up again; null means
    // immediately eligible (a fresh row, or one never retried yet).
    nextRetryAt: text("next_retry_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex(
      "eventsub_subscriptions_broadcaster_user_id_event_type_event_version_unique",
    ).on(table.broadcasterUserId, table.eventType, table.eventVersion),
    index("idx_eventsub_subscriptions_broadcaster_user_id").on(
      table.broadcasterUserId,
    ),
  ],
)

export const channelState = sqliteTable("channel_state", {
  broadcasterUserId: text("broadcaster_user_id").primaryKey(),
  isLive: integer("is_live").notNull().default(0),
  streamId: text("stream_id"),
  categoryId: text("category_id"),
  categoryName: text("category_name"),
  title: text("title"),
  thumbnailUrl: text("thumbnail_url"),
  viewerCount: integer("viewer_count"),
  startedAt: text("started_at"),
  // Twitch's stream type ("live" / "rerun" / "playlist" / "watch_party",
  // ADR 0050): null means "unknown" (rows written before this column
  // existed) and is treated as live rather than silently suppressed.
  streamType: text("stream_type"),
  // What the channel was last streaming and when it ended; kept across
  // offline syncs, overwritten only by the next live→offline transition.
  lastLiveAt: text("last_live_at"),
  lastCategoryId: text("last_category_id"),
  lastCategoryName: text("last_category_name"),
  updatedFromEventAt: text("updated_from_event_at"),
  updatedAt: text("updated_at").notNull(),
})

export const channelStateChanges = sqliteTable(
  "channel_state_changes",
  {
    id: text("id").primaryKey(),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    eventsubMessageId: text("eventsub_message_id").notNull().unique(),
    changeType: text("change_type").notNull(),
    previousIsLive: integer("previous_is_live"),
    nextIsLive: integer("next_is_live"),
    previousCategoryId: text("previous_category_id"),
    previousCategoryName: text("previous_category_name"),
    nextCategoryId: text("next_category_id"),
    nextCategoryName: text("next_category_name"),
    streamId: text("stream_id"),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_channel_state_changes_broadcaster_user_id").on(
      table.broadcasterUserId,
    ),
  ],
)

// Twitch box art template per category id, filled lazily on read (ADR 0058).
// A null URL is a cached "Twitch has no art for this id", not a missing row.
export const categoryBoxArt = sqliteTable("category_box_art", {
  id: text("id").primaryKey(),
  boxArtUrl: text("box_art_url"),
  updatedAt: text("updated_at").notNull(),
})

export const channelCategoryPreferences = sqliteTable(
  "channel_category_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    categoryId: text("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    createdAt: text("created_at").notNull(),
    disabledAt: text("disabled_at"),
  },
  (table) => [
    uniqueIndex(
      "channel_category_preferences_user_id_broadcaster_user_id_category_id_unique",
    ).on(table.userId, table.broadcasterUserId, table.categoryId),
    index("idx_channel_category_preferences_user_id").on(table.userId),
  ],
)

export const globalCategoryPreferences = sqliteTable(
  "global_category_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    categoryId: text("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    createdAt: text("created_at").notNull(),
    disabledAt: text("disabled_at"),
  },
  (table) => [
    uniqueIndex("global_category_preferences_user_id_category_id_unique").on(
      table.userId,
      table.categoryId,
    ),
    index("idx_global_category_preferences_user_id").on(table.userId),
  ],
)

export const notificationDeliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    pushSubscriptionId: text("push_subscription_id").references(
      () => pushSubscriptions.id,
    ),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    categoryId: text("category_id").notNull(),
    triggerType: text("trigger_type").notNull(),
    eventsubMessageId: text("eventsub_message_id"),
    streamId: text("stream_id"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    sentAt: text("sent_at"),
  },
  (table) => [
    uniqueIndex(
      "notification_deliveries_user_id_broadcaster_user_id_category_id_trigger_type_stream_id_unique",
    ).on(
      table.userId,
      table.broadcasterUserId,
      table.categoryId,
      table.triggerType,
      table.streamId,
    ),
    index("idx_notification_deliveries_user_status").on(
      table.userId,
      table.status,
    ),
    // Serves the send-side cooldown lookup (ADR 0056).
    index("idx_notification_deliveries_cooldown").on(
      table.userId,
      table.broadcasterUserId,
      table.status,
      table.sentAt,
    ),
  ],
)

export const notificationSnoozes = sqliteTable(
  "notification_snoozes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    categoryId: text("category_id").notNull(),
    fireAt: text("fire_at").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_notification_snoozes_status_fire_at").on(
      table.status,
      table.fireAt,
    ),
    // Idempotency lookup for pending reminder by user/broadcaster/category.
    index("idx_notification_snoozes_user_broadcaster_category").on(
      table.userId,
      table.broadcasterUserId,
      table.categoryId,
    ),
  ],
)

// ADR 0054: an active row removes the broadcaster from that one global
// preference's matches. Hangs off the preference so it survives disabling and
// reviving it.
export const globalCategoryPreferenceExclusions = sqliteTable(
  "global_category_preference_exclusions",
  {
    id: text("id").primaryKey(),
    preferenceId: text("preference_id")
      .notNull()
      .references(() => globalCategoryPreferences.id),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    createdAt: text("created_at").notNull(),
    disabledAt: text("disabled_at"),
  },
  (table) => [
    uniqueIndex(
      "global_category_preference_exclusions_preference_id_broadcaster_user_id_unique",
    ).on(table.preferenceId, table.broadcasterUserId),
  ],
)

// ADR 0054: an active row suppresses every notification about the broadcaster
// for this user, whichever preference would match.
export const broadcasterMutes = sqliteTable(
  "broadcaster_mutes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    broadcasterUserId: text("broadcaster_user_id").notNull(),
    createdAt: text("created_at").notNull(),
    disabledAt: text("disabled_at"),
  },
  (table) => [
    uniqueIndex("broadcaster_mutes_user_id_broadcaster_user_id_unique").on(
      table.userId,
      table.broadcasterUserId,
    ),
    // Serves "active mutes for this broadcaster among these users" at match time.
    index("idx_broadcaster_mutes_broadcaster_user_id").on(
      table.broadcasterUserId,
      table.userId,
    ),
  ],
)

export const schema = {
  users,
  twitchTokens,
  pushSubscriptions,
  followedChannels,
  monitoredChannels,
  eventsubSubscriptions,
  channelState,
  channelStateChanges,
  channelCategoryPreferences,
  globalCategoryPreferences,
  notificationDeliveries,
  notificationSnoozes,
  broadcasterMutes,
  globalCategoryPreferenceExclusions,
}

export type UserRow = typeof users.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
