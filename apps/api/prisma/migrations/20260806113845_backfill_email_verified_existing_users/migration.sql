-- Accounts created before mandatory email verification shipped must not be locked out.
-- Treat them as verified at their creation date (they already proved control of the inbox
-- by using it to log in over time; no verification token ever existed for them).
UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL;
