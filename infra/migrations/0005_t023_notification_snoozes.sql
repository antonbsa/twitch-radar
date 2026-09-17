CREATE TABLE `notification_snoozes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`original_delivery_id` text NOT NULL,
	`fire_at` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_delivery_id`) REFERENCES `notification_deliveries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notification_snoozes_status_fire_at` ON `notification_snoozes` (`status`,`fire_at`);--> statement-breakpoint
CREATE INDEX `idx_notification_snoozes_user_id` ON `notification_snoozes` (`user_id`);