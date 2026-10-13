import type { BindingLabel, BoundValue } from '../domain/bindings';
import type { ToolContext } from './tool-definition';

/**
 * Helpers that turn a façade's figures into bindings. They shape; they never compute a figure
 * (ADR-0016 §1). Descriptions are French text for the model, labels are structured data for the client.
 */

export function money(
  amountMinor: bigint | string,
  currency: string,
  description: string,
  label: BindingLabel,
): BoundValue {
  return { binding: { type: 'money', amountMinor: amountMinor.toString(), currency }, description, label };
}

export function percent(basisPoints: number, description: string, label: BindingLabel): BoundValue {
  return { binding: { type: 'percent', basisPoints }, description, label };
}

export function date(value: string, description: string, label: BindingLabel): BoundValue {
  return { binding: { type: 'date', value }, description, label };
}

/** `YYYY-MM-DD` of an instant in the user's timezone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** How a description designates a category: its alias when the server handed one out. */
export function categoryRef(context: ToolContext, categoryId: string | null): string {
  if (categoryId === null) return 'sans catégorie';
  const alias = context.aliases.categories.aliasFor(categoryId);
  return alias ? `catégorie ${alias}` : 'une catégorie hors de la liste fournie';
}

/** A signed amount as a magnitude, plus whether it is negative. The model never sees the sign, only the key. */
export function split(amountMinor: bigint): { magnitude: bigint; negative: boolean } {
  return amountMinor < 0n ? { magnitude: -amountMinor, negative: true } : { magnitude: amountMinor, negative: false };
}

/** Periods in descriptions: both bounds are inclusive local dates. */
export function periodText(from: string, to: string): string {
  return `du ${from} au ${to}`;
}
