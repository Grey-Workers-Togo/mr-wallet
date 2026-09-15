-- CreateIndex
CREATE INDEX "Account_userId_updatedAt_id_idx" ON "Account"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Budget_userId_updatedAt_id_idx" ON "Budget"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Category_userId_updatedAt_id_idx" ON "Category"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Debt_userId_updatedAt_id_idx" ON "Debt"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "RecurrenceRule_userId_updatedAt_id_idx" ON "RecurrenceRule"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_updatedAt_id_idx" ON "SavingsGoal"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Tag_userId_updatedAt_id_idx" ON "Tag"("userId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Transaction_userId_updatedAt_id_idx" ON "Transaction"("userId", "updatedAt", "id");
