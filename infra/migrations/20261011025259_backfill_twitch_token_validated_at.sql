UPDATE `twitch_tokens` SET `validated_at` = `updated_at` WHERE `validated_at` IS NULL;
