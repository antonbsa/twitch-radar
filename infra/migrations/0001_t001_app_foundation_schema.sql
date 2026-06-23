CREATE TABLE users (
  id TEXT PRIMARY KEY,
  twitch_user_id TEXT NOT NULL UNIQUE,
  twitch_login TEXT NOT NULL,
  twitch_display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_follow_sync_at TEXT
);

CREATE TABLE twitch_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scopes TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE followed_channels (
  user_id TEXT NOT NULL REFERENCES users(id),
  broadcaster_user_id TEXT NOT NULL,
  broadcaster_login TEXT NOT NULL,
  broadcaster_display_name TEXT NOT NULL,
  broadcaster_profile_image_url TEXT,
  followed_at TEXT,
  last_synced_at TEXT NOT NULL,
  PRIMARY KEY (user_id, broadcaster_user_id)
);

CREATE TABLE monitored_channels (
  broadcaster_user_id TEXT PRIMARY KEY,
  broadcaster_login TEXT,
  broadcaster_display_name TEXT,
  monitor_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disabled_at TEXT
);

CREATE TABLE eventsub_subscriptions (
  id TEXT PRIMARY KEY,
  twitch_subscription_id TEXT UNIQUE,
  broadcaster_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL,
  status TEXT NOT NULL,
  callback_url TEXT NOT NULL,
  secret_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE (broadcaster_user_id, event_type, event_version)
);

CREATE TABLE channel_state (
  broadcaster_user_id TEXT PRIMARY KEY,
  is_live INTEGER NOT NULL DEFAULT 0,
  stream_id TEXT,
  category_id TEXT,
  category_name TEXT,
  title TEXT,
  viewer_count INTEGER,
  started_at TEXT,
  updated_from_event_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE channel_state_changes (
  id TEXT PRIMARY KEY,
  broadcaster_user_id TEXT NOT NULL,
  eventsub_message_id TEXT NOT NULL UNIQUE,
  change_type TEXT NOT NULL,
  previous_is_live INTEGER,
  next_is_live INTEGER,
  previous_category_id TEXT,
  previous_category_name TEXT,
  next_category_id TEXT,
  next_category_name TEXT,
  stream_id TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE channel_category_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  broadcaster_user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT,
  UNIQUE (user_id, broadcaster_user_id, category_id)
);

CREATE TABLE global_category_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled_at TEXT,
  UNIQUE (user_id, category_id)
);

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  push_subscription_id TEXT REFERENCES push_subscriptions(id),
  broadcaster_user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  eventsub_message_id TEXT,
  stream_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  UNIQUE (user_id, broadcaster_user_id, category_id, trigger_type, stream_id)
);

CREATE INDEX idx_twitch_tokens_expires_at ON twitch_tokens (expires_at);
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions (user_id);
CREATE INDEX idx_followed_channels_broadcaster_user_id ON followed_channels (broadcaster_user_id);
CREATE INDEX idx_eventsub_subscriptions_broadcaster_user_id ON eventsub_subscriptions (broadcaster_user_id);
CREATE INDEX idx_channel_state_changes_broadcaster_user_id ON channel_state_changes (broadcaster_user_id);
CREATE INDEX idx_channel_category_preferences_user_id ON channel_category_preferences (user_id);
CREATE INDEX idx_global_category_preferences_user_id ON global_category_preferences (user_id);
CREATE INDEX idx_notification_deliveries_user_status ON notification_deliveries (user_id, status);
