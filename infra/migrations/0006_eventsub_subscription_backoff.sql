ALTER TABLE `eventsub_subscriptions` ADD `failure_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `eventsub_subscriptions` ADD `next_retry_at` text;