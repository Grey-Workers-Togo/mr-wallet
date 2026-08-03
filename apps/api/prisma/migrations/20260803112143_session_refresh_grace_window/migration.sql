-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "successorId" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMPTZ(6);
