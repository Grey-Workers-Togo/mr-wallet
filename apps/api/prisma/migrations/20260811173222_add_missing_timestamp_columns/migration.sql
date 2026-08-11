/*
  Warnings:

  - Added the required column `updatedAt` to the `BalanceCheck` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ExportJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BalanceCheck" ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMPTZ(6),
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6);
UPDATE "BalanceCheck" SET "updatedAt" = "checkedAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "BalanceCheck" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "BudgetPeriod" ADD COLUMN     "deletedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "DebtInstallment" ADD COLUMN     "deletedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "ExportJob" ADD COLUMN     "deletedAt" TIMESTAMPTZ(6),
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6);
UPDATE "ExportJob" SET "updatedAt" = COALESCE("completedAt", "startedAt", "createdAt") WHERE "updatedAt" IS NULL;
ALTER TABLE "ExportJob" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "deletedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deletedAt" TIMESTAMPTZ(6),
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6);
UPDATE "Notification" SET "updatedAt" = COALESCE("readAt", "createdAt") WHERE "updatedAt" IS NULL;
ALTER TABLE "Notification" ALTER COLUMN "updatedAt" SET NOT NULL;
