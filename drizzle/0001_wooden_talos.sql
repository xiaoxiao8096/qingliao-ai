CREATE TABLE `chat_conversations` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(120) NOT NULL DEFAULT '新对话',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` varchar(36) NOT NULL,
	`conversationId` varchar(36) NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_model_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`apiKeyEncrypted` text NOT NULL,
	`model` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_model_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_model_settings_user_idx` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `chat_conversations` ADD CONSTRAINT `chat_conversations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_conversationId_chat_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_model_settings` ADD CONSTRAINT `user_model_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `conversation_user_updated_idx` ON `chat_conversations` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `message_conversation_created_idx` ON `chat_messages` (`conversationId`,`createdAt`);