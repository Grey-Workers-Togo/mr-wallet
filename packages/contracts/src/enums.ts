/**
 * Union-of-literals mirrors, not TypeScript `enum` (docs/10-conventions-dev.md §2).
 * Kept in sync by hand with `apps/api/prisma/schema.prisma` — every value needs an i18n
 * translation in both `fr.json` and `en.json` (RG-L5), enforced in CI.
 */

export const accountTypes = [
  'CASH',
  'BANK',
  'MOBILE_MONEY',
  'CREDIT_CARD',
  'SAVINGS',
  'WALLET',
  'OTHER',
] as const;
export type AccountType = (typeof accountTypes)[number];

export const transactionTypes = ['EXPENSE', 'INCOME', 'TRANSFER'] as const;
export type TransactionType = (typeof transactionTypes)[number];

export const txStatuses = ['PENDING', 'CLEARED', 'RECONCILED', 'VOID'] as const;
export type TxStatus = (typeof txStatuses)[number];
