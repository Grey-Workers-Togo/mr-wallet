import { formatMonth } from './format';
import type { BindingLabel } from './types';

/** Display names the client already holds for the user's own entities, by id. */
export interface EntityNames {
  categories: Record<string, string>;
  accounts: Record<string, string>;
  budgets: Record<string, string>;
  goals: Record<string, string>;
}

export const EMPTY_NAMES: EntityNames = { categories: {}, accounts: {}, budgets: {}, goals: {} };

/**
 * What a value is about, for the second column of the fallback table: the user's own name for the
 * entity when the client has it, else a free-text description, a month, a currency or a rank. The API
 * returns identifiers and parameters only; the words come from here (ADR-0009).
 */
export function subjectOf(
  label: BindingLabel,
  names: EntityNames,
  context: { locale: string; rankText: (rank: number) => string },
): string | null {
  const params = label.params ?? {};
  const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

  const named =
    text(params.description) ??
    (text(params.categoryId) && names.categories[params.categoryId as string]) ??
    (text(params.accountId) && names.accounts[params.accountId as string]) ??
    (text(params.budgetId) && names.budgets[params.budgetId as string]) ??
    (text(params.goalId) && names.goals[params.goalId as string]);
  if (named) return named;

  const month = text(params.month);
  if (month && /^\d{4}-\d{2}$/.test(month)) return formatMonth(month, context.locale);
  const currency = text(params.currency);
  if (currency) return currency;
  return typeof params.rank === 'number' ? context.rankText(params.rank) : null;
}
