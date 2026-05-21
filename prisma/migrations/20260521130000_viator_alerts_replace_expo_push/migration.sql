-- DropTable
DROP TABLE `expo_push_tokens`;

-- CreateTable
CREATE TABLE `viator_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `viator_reference` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(500) NOT NULL,
    `pickup_date_label` VARCHAR(200) NOT NULL,
    `received_at` DATETIME(3) NOT NULL,
    `booking_uuid` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `dismissed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `viator_alerts_viator_reference_key`(`viator_reference`),
    INDEX `viator_alerts_dismissed_at_received_at_idx`(`dismissed_at`, `received_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
