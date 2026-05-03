-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "completed_at" TIMESTAMP(3);

-- Approximate completion time for existing completed rows (past list ordering)
UPDATE "Booking"
SET "completed_at" = "createdAt"
WHERE LOWER("status") = 'completed';
