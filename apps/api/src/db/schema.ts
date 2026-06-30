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
  viewerCount: integer("viewer_count"),
  startedAt: text("started_at"),
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
}

export type UserRow = typeof users.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
