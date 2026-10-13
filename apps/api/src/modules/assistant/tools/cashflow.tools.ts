import { z } from 'zod';
import type { BoundValue } from '../domain/bindings';
import { shareBasisPoints } from '../domain/derived';
import { resolvePeriod, symbolicPeriodSchema, type ResolvedPeriod } from '../domain/period-resolver';
import type { ForecastingFacade } from '../../forecasting/forecasting.facade';
import type { ReportingFacade } from '../../reporting/reporting.facade';
import { money, percent, periodText, split } from './shaping';
import { defineTool, type Tool, type ToolContext } from './tool-definition';

const MAX_FORECAST_MONTHS = 6;

/**
 * Per-month rows of a resolved period. `cashflow` takes an exclusive `to` and lists every month it
 * touches, so a bound falling exactly on a month start yields one trailing empty month: dropped here.
 */
async function monthsOf(reporting: ReportingFacade, context: ToolContext, period: ResolvedPeriod) {
  const report = await reporting.cashflow(context.userId, { from: period.from, to: period.to });
  const first = period.localFrom.slice(0, 7);
  const last = period.localTo.slice(0, 7);
  return { currency: report.currency, months: report.months.filter((row) => row.month >= first && row.month <= last) };
}

/** A net figure as `surplus` (≥ 0) or `deficit`: the key carries the sign, since the model never sees values. */
function net(
  suffix: string,
  netMinor: bigint,
  currency: string,
  scope: string,
  params?: Record<string, string>,
): [string, BoundValue] {
  const { magnitude, negative } = split(netMinor);
  return negative
    ? [
        `deficit${suffix}`,
        money(magnitude, currency, `Déficit : les dépenses dépassent les revenus ${scope}`, { key: 'assistant.binding.deficit', params }),
      ]
    : [
        `surplus${suffix}`,
        money(magnitude, currency, `Excédent : revenus moins dépenses ${scope}`, { key: 'assistant.binding.surplus', params }),
      ];
}

/** ADR-0016 §1: `ReportingFacade.cashflow`, as totals over the period. */
export function cashflowTool(reporting: ReportingFacade): Tool {
  return defineTool({
    name: 'cashflow',
    description: 'Revenus, dépenses et solde net (excédent ou déficit) de l’utilisateur sur une période, en totaux.',
    argsSchema: z.object({ period: symbolicPeriodSchema }).strict(),
    async execute(context, args) {
      const period = resolvePeriod(args.period, { now: context.now, timeZone: context.timeZone });
      const { currency, months } = await monthsOf(reporting, context, period);
      // Sum of the façade's per-month figures, already consolidated in the base currency.
      const income = months.reduce((sum, row) => sum + BigInt(row.incomeMinor), 0n);
      const expense = months.reduce((sum, row) => sum + BigInt(row.expenseMinor), 0n);
      const text = periodText(period.localFrom, period.localTo);
      const [netKey, netValue] = net('', income - expense, currency, text);
      return {
        period,
        values: {
          income: money(income, currency, `Revenus ${text}`, { key: 'assistant.binding.income' }),
          expense: money(expense, currency, `Dépenses ${text}`, { key: 'assistant.binding.expense' }),
          [netKey]: netValue,
        },
      };
    },
  });
}

/**
 * ADR-0016 §1 maps this tool to `monthlySummary`. It uses `cashflow` instead, because `monthlySummary`
 * only knows "the last N months from now" and cannot follow a resolved period (docs/QUESTIONS.md, lot A1).
 */
export function monthlySummaryTool(reporting: ReportingFacade): Tool {
  return defineTool({
    name: 'monthly_summary',
    description:
      'Revenus, dépenses et solde net (excédent ou déficit) de l’utilisateur mois par mois sur une période. ' +
      'Le mois figure dans le nom de chaque repère.',
    argsSchema: z.object({ period: symbolicPeriodSchema }).strict(),
    async execute(context, args) {
      const period = resolvePeriod(args.period, { now: context.now, timeZone: context.timeZone });
      const { currency, months } = await monthsOf(reporting, context, period);
      const values: Record<string, BoundValue> = {};
      for (const row of months) {
        const suffix = `_${row.month.replace('-', '_')}`;
        const params = { month: row.month };
        const scope = `du mois ${row.month}`;
        values[`income${suffix}`] = money(row.incomeMinor, currency, `Revenus ${scope}`, { key: 'assistant.binding.income', params });
        values[`expense${suffix}`] = money(row.expenseMinor, currency, `Dépenses ${scope}`, {
          key: 'assistant.binding.expense',
          params,
        });
        const [netKey, netValue] = net(suffix, BigInt(row.netMinor), currency, scope, params);
        values[netKey] = netValue;
      }
      return { period, values };
    },
  });
}

/**
 * ADR-0016 §1: `ReportingFacade.comparison`. Differences and percentages are computed here in
 * integers, never by the model (RG-AT5). The key says whether it is a rise or a fall.
 */
export function comparePeriodsTool(reporting: ReportingFacade): Tool {
  return defineTool({
    name: 'compare_periods',
    description:
      'Compare revenus et dépenses de deux périodes : `current` et `previous`. Renvoie les deux totaux et, quand ' +
      'elle existe, la hausse ou la baisse en montant et en pourcentage.',
    argsSchema: z.object({ current: symbolicPeriodSchema, previous: symbolicPeriodSchema }).strict(),
    async execute(context, args) {
      const resolve = (period: string) => resolvePeriod(period, { now: context.now, timeZone: context.timeZone });
      const current = resolve(args.current);
      const previous = resolve(args.previous);
      // `comparison` filters with `<`: the exclusive bounds go through unchanged.
      const report = await reporting.comparison(context.userId, {
        currentFrom: current.from,
        currentTo: current.to,
        previousFrom: previous.from,
        previousTo: previous.to,
      });
      const values: Record<string, BoundValue> = {};
      const currentText = periodText(current.localFrom, current.localTo);
      const previousText = periodText(previous.localFrom, previous.localTo);
      const kinds = [
        { name: 'expense', noun: 'dépenses', now: report.current.expenseMinor, before: report.previous.expenseMinor },
        { name: 'income', noun: 'revenus', now: report.current.incomeMinor, before: report.previous.incomeMinor },
      ] as const;
      for (const kind of kinds) {
        const now = BigInt(kind.now);
        const before = BigInt(kind.before);
        values[`${kind.name}_current`] = money(now, report.currency, `Total des ${kind.noun} de la période courante ${currentText}`, {
          key: `assistant.binding.${kind.name}_current`,
        });
        values[`${kind.name}_previous`] = money(
          before,
          report.currency,
          `Total des ${kind.noun} de la période précédente ${previousText}`,
          { key: `assistant.binding.${kind.name}_previous` },
        );
        const { magnitude, negative } = split(now - before);
        if (magnitude === 0n) continue;
        const direction = negative ? 'decrease' : 'increase';
        const word = negative ? 'Baisse' : 'Hausse';
        values[`${kind.name}_${direction}`] = money(
          magnitude,
          report.currency,
          `${word} des ${kind.noun} par rapport à la période précédente, en montant`,
          { key: `assistant.binding.${kind.name}_${direction}` },
        );
        const change = shareBasisPoints(magnitude, before);
        if (change !== null) {
          values[`${kind.name}_change_pct`] = percent(
            change,
            `${word} des ${kind.noun} par rapport à la période précédente, en pourcentage`,
            { key: `assistant.binding.${kind.name}_${direction}_pct` },
          );
        }
      }
      return { period: current, comparedTo: previous, values };
    },
  });
}

/** ADR-0016 §1: `ForecastingFacade`. An estimate, never a prediction (RG-F5): the descriptions say so. */
export function cashflowForecastTool(forecasting: ForecastingFacade): Tool {
  return defineTool({
    name: 'cashflow_forecast',
    description:
      'Estimation du solde de l’utilisateur à la fin de chacun des prochains mois, d’après ses opérations ' +
      'récurrentes et ses échéances de dettes. C’est une estimation, pas une prévision certaine.',
    argsSchema: z.object({ months: z.number().int().min(1).max(MAX_FORECAST_MONTHS).default(3) }).strict(),
    async execute(context, args) {
      const forecast = await forecasting.cashflowForecast(context.userId, args.months);
      const values: Record<string, BoundValue> = {};
      forecast.months.slice(0, args.months).forEach((row, index) => {
        const position = index + 1;
        const { magnitude, negative } = split(BigInt(row.balanceMinor));
        const caveats = [
          forecast.historyIncomplete && 'historique insuffisant, estimation peu fiable',
          row.cashWarning && 'alerte de trésorerie',
        ].filter(Boolean);
        const suffix = caveats.length > 0 ? ` (${caveats.join(' ; ')})` : '';
        values[`${negative ? 'shortfall' : 'balance'}_${position}`] = money(
          magnitude,
          forecast.currency,
          `${negative ? 'Découvert estimé' : 'Solde estimé'} à la fin du mois n°${position} à venir${suffix}`,
          {
            key: negative ? 'assistant.binding.forecast_shortfall' : 'assistant.binding.forecast_balance',
            params: { month: row.month, rank: position },
          },
        );
      });
      return { values };
    },
  });
}
