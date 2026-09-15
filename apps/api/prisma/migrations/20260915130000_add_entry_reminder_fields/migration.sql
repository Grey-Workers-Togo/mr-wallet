-- Lot 20 (docs/04 §K, RG-N12..RG-N16): entry and reconciliation reminders — the only proactive
-- notification types, driven by a daily/monthly job rather than an event.
ALTER TYPE "NotificationType" ADD VALUE 'ENTRY_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'RECONCILE_REMINDER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "entryReminderDays" INTEGER DEFAULT 3;
