-- Lot 18 (docs/04 §D, RG-T13) adds `category.expense.transaction_fees` as a new system category
-- after the initial 16. New users get it automatically via seedSystemDefaults(); existing users
-- need it backfilled so a fee line always has a valid default category to fall into.
INSERT INTO "Category" (id, "userId", "i18nKey", kind, "isSystem", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u.id, 'category.expense.transaction_fees', 'EXPENSE', true, 1000, now(), now()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" c WHERE c."userId" = u.id AND c."i18nKey" = 'category.expense.transaction_fees'
);
