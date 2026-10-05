CREATE TABLE `broadcaster_mutes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`disabled_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broadcaster_mutes_user_id_broadcaster_user_id_unique` ON `broadcaster_mutes` (`user_id`,`broadcaster_user_id`);--> statement-breakpoint
CREATE INDEX `idx_broadcaster_mutes_broadcaster_user_id` ON `broadcaster_mutes` (`broadcaster_user_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `notifications_paused_at` text;