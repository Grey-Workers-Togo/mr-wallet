-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockMinutes" INTEGER NOT NULL DEFAULT 5;
