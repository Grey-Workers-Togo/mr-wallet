import { z } from 'zod';
import type { BoundValue } from '../domain/bindings';
import { shareBasisPoints } from '../domain/derived';
import { resolvePeriod, symbolicPeriodSchema } from '../domain/period-resolver';
import type { ReportingFacade } from '../../reporting/reporting.facade';
import { categoryRef, date, localDate, money, percent, periodText } from './shaping';
import { defineTool, ToolFailure, type Tool } from './tool-definition';

/** Bounds the number of bindings, hence the length of what the model has to reason about. */
const MAX_CATEGORIES = 5;
const MAX_TOP_EXPENSES = 5;
const CATEGORY_ALIAS = /^c[1-9][0-9]*$/;

/**
 * ADR-0016 §1: `ReportingFacade.spendingByCategory`. The façade's float `pct` is ignored: shares are
 * recomputed in integers (RG-AT5).
 */
export function spendingByCategoryTool(reporting: ReportingFacade): Tool {
  return defineTool({
    name: 'spending_by_category',
    description:
      'Dépenses de l’utilisateur sur une période, par catégorie. Une catégorie compte ses sous-catégories. ' +
      `Sans \`category\`, renvoie le total et les ${MAX_CATEGORIES} premières catégories par montant ; ` +
      'avec `category` (alias c1, c2…), uniquement cette catégorie.',
    argsSchema: z.object({ period: symbolicPeriodSchema, category: z.string().regex(CATEGORY_ALIAS).optional() }).strict(),
    async execute(context, args) {
      const period = resolvePeriod(args.period, { now: context.now, timeZone: context.timeZone });
      // `spendingByCategory` filters with `lte`: the resolved bound is exclusive, so the last millisecond is dropped.
      // A parent counts its subcategories (RG-B2 does the same for budgets); the screens keep exact categories.
      const report = await reporting.spendingByCategory(
        context.userId,
        { from: period.from, to: new Date(period.to.getTime() - 1) },
        { includeDescendants: true },
      );
      const total = BigInt(report.totalMinor);
      const text = periodText(period.localFrom, period.localTo);
      const values: Record<string, BoundValue> = {};
      values.total = money(total, report.currency, `Total des dépenses ${text}`, { key: 'assistant.binding.spending_total' });

      if (args.category) {
        const categoryId = context.aliases.categories.resolve(args.category);
        if (categoryId === undefined) throw new ToolFailure('UNKNOWN_ALIAS', [{ field: 'category', code: 'UNKNOWN_ALIAS' }]);
        const item = report.items.find((candidate) => candidate.categoryId === categoryId);
        const amount = BigInt(item?.totalMinor ?? '0');
        const params = { categoryId };
        values.category_total = money(amount, report.currency, `Dépenses de la catégorie ${args.category} ${text}`, {
          key: 'assistant.binding.category_total',
          params,
        });
        const share = shareBasisPoints(amount, total);
        if (share !== null) {
          values.category_share = percent(share, `Part de la catégorie ${args.category} dans les dépenses ${text}`, {
            key: 'assistant.binding.category_share',
            params,
          });
        }
        return { period, values };
      }

      if (BigInt(report.unaccountedMinor) > 0n) {
        values.unaccounted = money(
          report.unaccountedMinor,
          report.currency,
          'Ajustements de réconciliation, dépenses non identifiées, hors des catégories',
          { key: 'assistant.binding.spending_unaccounted' },
        );
      }
      // Largest first; ties broken by id so two questions on the same data list the same order.
      // Only top-level categories: a subcategory is already inside its parent's figure, and listing both
      // would count it twice in the reader's head.
      const ranked = report.items
        .filter((item) => !item.parentId)
        .map((item) => ({ ...item, amount: BigInt(item.totalMinor) }))
        .sort((a, b) =>
          a.amount === b.amount ? String(a.categoryId).localeCompare(String(b.categoryId)) : a.amount > b.amount ? -1 : 1,
        )
        .slice(0, MAX_CATEGORIES);
      ranked.forEach((item, index) => {
        const rank = index + 1;
        const params = { rank, ...(item.categoryId !== null && { categoryId: item.categoryId }) };
        const subject = categoryRef(context, item.categoryId);
        values[`top_${rank}_amount`] = money(item.amount, report.currency, `Dépenses (${subject}), n°${rank} par montant ${text}`, {
          key: 'assistant.binding.category_total',
          params,
        });
        const share = shareBasisPoints(item.amount, total);
        if (share !== null) {
          values[`top_${rank}_share`] = percent(share, `Part des dépenses (${subject}), n°${rank} par montant`, {
            key: 'assistant.binding.category_share',
            params,
          });
        }
      });
      return { period, values };
    },
  });
}

/**
 * ADR-0016 §1: `ReportingFacade.topTransactions`, limit ≤ 5. A transaction's free-text description
 * travels to the client in the label, never to the provider (ADR-0019, ADR-0021).
 */
export function topExpensesTool(reporting: ReportingFacade): Tool {
  return defineTool({
    name: 'top_expenses',
    description: `Les plus grosses dépenses de l’utilisateur sur une période (${MAX_TOP_EXPENSES} au plus), de la plus grosse à la plus petite.`,
    argsSchema: z
      .object({ period: symbolicPeriodSchema, limit: z.number().int().min(1).max(MAX_TOP_EXPENSES).default(3) })
      .strict(),
    async execute(context, args) {
      const period = resolvePeriod(args.period, { now: context.now, timeZone: context.timeZone });
      const rows = await reporting.topTransactions(
        context.userId,
        { from: period.from, to: new Date(period.to.getTime() - 1), limit: args.limit },
        { excludeAdjustments: true },
      );
      const values: Record<string, BoundValue> = {};
      rows.forEach((row, index) => {
        const rank = index + 1;
        const params = {
          rank,
          ...(row.categoryId !== null && { categoryId: row.categoryId }),
          ...(row.description && { description: row.description }),
        };
        const subject = categoryRef(context, row.categoryId);
        values[`amount_${rank}`] = money(row.amountMinor, row.currency, `Montant de la dépense n°${rank} par montant (${subject})`, {
          key: 'assistant.binding.top_expense_amount',
          params,
        });
        values[`date_${rank}`] = date(localDate(row.occurredAt, context.timeZone), `Date de la dépense n°${rank} par montant`, {
          key: 'assistant.binding.top_expense_date',
          params: { rank },
        });
      });
      return { period, values };
    },
  });
}
