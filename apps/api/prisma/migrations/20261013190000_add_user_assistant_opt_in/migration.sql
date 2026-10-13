-- Lot A1.1 (ADR-0019, RG-AP8): server-side proof that the user accepted the assistant.
-- A single nullable timestamp: null means no consent. Additive and reversible; no text.
-- Down: ALTER TABLE "User" DROP COLUMN "assistantOptInAt";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "assistantOptInAt" TIMESTAMPTZ(6);
