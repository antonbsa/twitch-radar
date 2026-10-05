CREATE TABLE `global_category_preference_exclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`preference_id` text NOT NULL,
	`broadcaster_user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`disabled_at` text,
	FOREIGN KEY (`preference_id`) REFERENCES `global_category_preferences`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_category_preference_exclusions_preference_id_broadcaster_user_id_unique` ON `global_category_preference_exclusions` (`preference_id`,`broadcaster_user_id`);