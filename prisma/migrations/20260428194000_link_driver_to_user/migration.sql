-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Driver_user_id_key" ON "Driver"("user_id");

-- AddForeignKey
ALTER TABLE "Driver"
ADD CONSTRAINT "Driver_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
