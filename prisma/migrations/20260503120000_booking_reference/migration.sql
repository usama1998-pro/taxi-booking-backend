-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "booking_reference" TEXT;

-- Backfill from public uuid (globally unique)
UPDATE "Booking" SET "booking_reference" = 'BK-' || upper(replace("uuid"::text, '-', ''));

-- CreateIndex
CREATE UNIQUE INDEX "Booking_booking_reference_key" ON "Booking"("booking_reference");

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "booking_reference" SET NOT NULL;
