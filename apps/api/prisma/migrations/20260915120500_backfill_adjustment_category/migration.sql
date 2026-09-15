-- Lot 19 (docs/04 §B, RG-A9) adds `category.expense.adjustment` as a new system category after
-- transaction_fees. New users get it automatically via seedSystemDefaults(); existing users need
-- it backfilled so a reconciliation adjustment always has a valid default category to fall into.
INSERT INTO "Category" (id, "userId", "i18nKey", kind, "isSystem", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u.id, 'category.expense.adjustment', 'EXPENSE', true, 1001, now(), now()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" c WHERE c."userId" = u.id AND c."i18nKey" = 'category.expense.adjustment'
);
