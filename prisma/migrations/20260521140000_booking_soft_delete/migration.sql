-- Soft delete (trash): bookings are hidden until purged in batches.
ALTER TABLE `Booking` ADD COLUMN `deleted_at` DATETIME(3) NULL;

CREATE INDEX `Booking_deleted_at_idx` ON `Booking`(`deleted_at`);
