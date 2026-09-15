-- AlterEnum
ALTER TYPE "TxSource" ADD VALUE 'FEE';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "feeForTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_feeForTransactionId_key" ON "Transaction"("feeForTransactionId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_feeForTransactionId_fkey" FOREIGN KEY ("feeForTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

