/**
 * Server-side mirror of the system category labels (apps/web/messages/*.json `category.*`).
 * Used only to resolve the *effective* name for RG-C7 uniqueness checks — never returned to
 * the client, which always resolves `i18nKey` itself (CLAUDE.md "Langues").
 */
const SYSTEM_CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  'category.expense.food': { fr: 'Alimentation', en: 'Food' },
  'category.expense.housing': { fr: 'Logement', en: 'Housing' },
  'category.expense.transport': { fr: 'Transport', en: 'Transport' },
  'category.expense.utilities': { fr: 'Factures', en: 'Utilities' },
  'category.expense.health': { fr: 'Santé', en: 'Health' },
  'category.expense.education': { fr: 'Éducation', en: 'Education' },
  'category.expense.leisure': { fr: 'Loisirs', en: 'Leisure' },
  'category.expense.clothing': { fr: 'Habillement', en: 'Clothing' },
  'category.expense.communication': { fr: 'Communication', en: 'Communication' },
  'category.expense.insurance': { fr: 'Assurance', en: 'Insurance' },
  'category.expense.debt_payment': { fr: 'Remboursement de dette', en: 'Debt payment' },
  'category.expense.gifts_donations': { fr: 'Cadeaux et dons', en: 'Gifts & donations' },
  'category.expense.personal_care': { fr: 'Soins personnels', en: 'Personal care' },
  'category.expense.subscriptions': { fr: 'Abonnements', en: 'Subscriptions' },
  'category.expense.taxes': { fr: 'Impôts et taxes', en: 'Taxes' },
  'category.expense.other_expense': { fr: 'Autres dépenses', en: 'Other expenses' },
  'category.income.salary': { fr: 'Salaire', en: 'Salary' },
  'category.income.business': { fr: 'Revenus d’entreprise', en: 'Business income' },
  'category.income.investments': { fr: 'Investissements', en: 'Investments' },
  'category.income.gifts_received': { fr: 'Cadeaux reçus', en: 'Gifts received' },
  'category.income.refunds': { fr: 'Remboursements', en: 'Refunds' },
  'category.income.rental_income': { fr: 'Revenus locatifs', en: 'Rental income' },
  'category.income.side_hustle': { fr: 'Activité annexe', en: 'Side hustle' },
  'category.income.other_income': { fr: 'Autres revenus', en: 'Other income' },
};

/** Single source of truth for the seeded system categories (roadmap Lot 2: 16 expense + 8 income). */
export const SYSTEM_CATEGORY_DEFINITIONS: { i18nKey: string; kind: 'EXPENSE' | 'INCOME' }[] = Object.keys(
  SYSTEM_CATEGORY_LABELS,
).map((i18nKey) => ({ i18nKey, kind: i18nKey.startsWith('category.expense.') ? 'EXPENSE' : 'INCOME' }));

export type SupportedLocale = 'fr' | 'en';

export function localeFromUserLocale(userLocale: string): SupportedLocale {
  return userLocale.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

/** RG-C6: `name` wins when set, otherwise the translation of `i18nKey`. */
export function resolveCategoryName(
  category: { name: string | null; i18nKey: string | null },
  locale: SupportedLocale,
): string {
  if (category.name) return category.name;
  const labels = category.i18nKey ? SYSTEM_CATEGORY_LABELS[category.i18nKey] : undefined;
  if (labels) {
    return labels[locale];
  }
  return category.i18nKey ?? '';
}
