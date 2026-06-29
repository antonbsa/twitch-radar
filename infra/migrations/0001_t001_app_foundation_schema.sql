CREATE TABLE `channel_category_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`category_name` text NOT NULL,
	`created_at` text NOT NULL,
	`disabled_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_category_preferences_user_id_broadcaster_user_id_category_id_unique` ON `channel_category_preferences` (`user_id`,`broadcaster_user_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `idx_channel_category_preferences_user_id` ON `channel_category_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `channel_state` (
	`broadcaster_user_id` text PRIMARY KEY NOT NULL,
	`is_live` integer DEFAULT 0 NOT NULL,
	`stream_id` text,
	`category_id` text,
	`category_name` text,
	`title` text,
	`viewer_count` integer,
	`started_at` text,
	`updated_from_event_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `channel_state_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`eventsub_message_id` text NOT NULL,
	`change_type` text NOT NULL,
	`previous_is_live` integer,
	`next_is_live` integer,
	`previous_category_id` text,
	`previous_category_name` text,
	`next_category_id` text,
	`next_category_name` text,
	`stream_id` text,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channel_state_changes_eventsub_message_id_unique` ON `channel_state_changes` (`eventsub_message_id`);--> statement-breakpoint
CREATE INDEX `idx_channel_state_changes_broadcaster_user_id` ON `channel_state_changes` (`broadcaster_user_id`);--> statement-breakpoint
CREATE TABLE `eventsub_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`twitch_subscription_id` text,
	`broadcaster_user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_version` text NOT NULL,
	`status` text NOT NULL,
	`callback_url` text NOT NULL,
	`secret_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eventsub_subscriptions_twitch_subscription_id_unique` ON `eventsub_subscriptions` (`twitch_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `eventsub_subscriptions_broadcaster_user_id_event_type_event_version_unique` ON `eventsub_subscriptions` (`broadcaster_user_id`,`event_type`,`event_version`);--> statement-breakpoint
CREATE INDEX `idx_eventsub_subscriptions_broadcaster_user_id` ON `eventsub_subscriptions` (`broadcaster_user_id`);--> statement-breakpoint
CREATE TABLE `followed_channels` (
	`user_id` text NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`broadcaster_login` text NOT NULL,
	`broadcaster_display_name` text NOT NULL,
	`broadcaster_profile_image_url` text,
	`followed_at` text,
	`last_synced_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `broadcaster_user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_followed_channels_broadcaster_user_id` ON `followed_channels` (`broadcaster_user_id`);--> statement-breakpoint
CREATE TABLE `global_category_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`category_name` text NOT NULL,
	`created_at` text NOT NULL,
	`disabled_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_category_preferences_user_id_category_id_unique` ON `global_category_preferences` (`user_id`,`category_id`);--> statement-breakpoint
CREATE INDEX `idx_global_category_preferences_user_id` ON `global_category_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `monitored_channels` (
	`broadcaster_user_id` text PRIMARY KEY NOT NULL,
	`broadcaster_login` text,
	`broadcaster_display_name` text,
	`monitor_reason` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`disabled_at` text
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`push_subscription_id` text,
	`broadcaster_user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`eventsub_message_id` text,
	`stream_id` text,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` text NOT NULL,
	`sent_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`push_subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_user_id_broadcaster_user_id_category_id_trigger_type_stream_id_unique` ON `notification_deliveries` (`user_id`,`broadcaster_user_id`,`category_id`,`trigger_type`,`stream_id`);--> statement-breakpoint
CREATE INDEX `idx_notification_deliveries_user_status` ON `notification_deliveries` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_user_id` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `twitch_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` text NOT NULL,
	`scopes` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_twitch_tokens_expires_at` ON `twitch_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`twitch_user_id` text NOT NULL,
	`twitch_login` text NOT NULL,
	`twitch_display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_follow_sync_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_twitch_user_id_unique` ON `users` (`twitch_user_id`);