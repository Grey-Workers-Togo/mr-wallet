-- Lot 19 (docs/04 §B, RG-A12): tracks the last time the user reconciled an account against
-- reality, distinct from balanceCheckedAt (the internal nightly drift check, RG-A11).
ALTER TABLE "Account" ADD COLUMN     "lastReconciledAt" TIMESTAMPTZ(6);
