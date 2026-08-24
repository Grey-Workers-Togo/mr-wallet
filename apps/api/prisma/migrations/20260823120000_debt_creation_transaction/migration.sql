-- AlterEnum
ALTER TYPE "TxSource" ADD VALUE 'DEBT_CREATION';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "debtId" TEXT;

-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "creationTransactionId" TEXT;
