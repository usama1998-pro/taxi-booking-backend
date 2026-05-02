-- CreateEnum
CREATE TYPE "InvoiceAddressKind" AS ENUM ('LOCATION', 'AIRPORT');

-- CreateTable
CREATE TABLE "driver_invoices" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "booking_reference" TEXT NOT NULL,
    "pickup_date" TIMESTAMP(3) NOT NULL,
    "pickup_kind" "InvoiceAddressKind" NOT NULL,
    "pickup_address" TEXT,
    "pickup_airline" TEXT,
    "pickup_flight_no" TEXT,
    "dropoff_kind" "InvoiceAddressKind" NOT NULL,
    "dropoff_address" TEXT,
    "dropoff_airline" TEXT,
    "dropoff_flight_no" TEXT,
    "price_amount" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(8,6) NOT NULL DEFAULT 0.10,
    "tax_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "source_booking_uuid" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_invoices_driver_id_created_at_idx" ON "driver_invoices"("driver_id", "created_at");

-- AddForeignKey
ALTER TABLE "driver_invoices" ADD CONSTRAINT "driver_invoices_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
