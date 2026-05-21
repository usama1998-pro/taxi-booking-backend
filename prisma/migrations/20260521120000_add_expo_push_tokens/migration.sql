-- CreateTable
CREATE TABLE `expo_push_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `driver_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `platform` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `expo_push_tokens_token_key`(`token`),
    INDEX `expo_push_tokens_driver_id_idx`(`driver_id`),
    INDEX `expo_push_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `expo_push_tokens` ADD CONSTRAINT `expo_push_tokens_driver_id_fkey` FOREIGN KEY (`driver_id`) REFERENCES `Driver`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expo_push_tokens` ADD CONSTRAINT `expo_push_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
