-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "uuid" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_uuid_key" ON "Booking"("uuid");
