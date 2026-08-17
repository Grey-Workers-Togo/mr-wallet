-- CreateEnum
CREATE TYPE "ScheduleMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "termDays" INTEGER,
ADD COLUMN     "scheduleMode" "ScheduleMode" NOT NULL DEFAULT 'AUTO';

UPDATE "Debt" SET "termDays" = "termMonths" * 30 WHERE "termMonths" IS NOT NULL;

ALTER TABLE "Debt" DROP COLUMN "termMonths";
