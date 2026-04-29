-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "customer_name" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "customer_email" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "customer_phone" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "flight_number" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "return_time" TIMESTAMP(3);
