-- AlterTable
ALTER TABLE "User" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
