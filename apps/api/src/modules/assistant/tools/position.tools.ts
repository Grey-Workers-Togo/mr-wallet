import { z } from 'zod';
import type { BoundValue } from '../domain/bindings';
import { shareBasisPoints } from '../domain/derived';
import type { AccountsFacade } from '../../accounts/accounts.facade';
import type { BudgetsFacade } from '../../budgets/budgets.facade';
import type { DebtsFacade } from '../../debts/debts.facade';
import type { GoalsFacade } from '../../goals/goals.facade';
import type { ReportingFacade } from '../../reporting/reporting.facade';
import { categoryRef, date, localDate, money, percent, split } from './shaping';
import { defineTool, ToolFailure, type Tool } from './tool-definition';

const MAX_BUDGETS = 8;
const MAX_GOALS = 5;
const ACCOUNT_ALIAS = /^a[1-9][0-9]*$/;

/*
 * Budget, goal and debt names are user-entered and are not on ADR-0019's list of what the provider may
 * receive (categories and accounts only). They are designated by rank and category alias; the client
 * resolves the real name from the id carried in the label.
 */

/** ADR-0016 §1: `AccountsFacade`. Archived accounts are not listed. */
export function accountBalancesTool(accounts: AccountsFacade): Tool {
  return defineTool({
    name: 'account_balances',
    description: 'Solde actuel des comptes de l’utilisateur (alias a1, a2…), dans la devise de chaque compte.',
    argsSchema: z.object({ account: z.string().regex(ACCOUNT_ALIAS).optional() }).strict(),
    async execute(context, args) {
      const wanted = args.account ? context.aliases.accounts.resolve(args.account) : undefined;
      if (args.account && wanted === undefined) {
        throw new ToolFailure('UNKNOWN_ALIAS', [{ field: 'account', code: 'UNKNOWN_ALIAS' }]);
      }

      const values: Record<string, BoundValue> = {};
      for (const account of await accounts.list(context.userId)) {
        if (account.isArchived || (wanted !== undefined && account.id !== wanted)) continue;
        const alias = context.aliases.accounts.aliasFor(account.id);
        if (!alias) continue;
        values[`balance_${alias}`] = money(account.currentBalanceMinor, account.currency, `Solde actuel du compte ${alias}`, {
          key: 'assistant.binding.account_balance',
          params: { accountId: account.id },
        });
      }
      return { values };
    },
  });
}

/** ADR-0016 §1: `ReportingFacade.netWorth`. */
export function netWorthTool(reporting: ReportingFacade): Tool {
  return defineTool({
    name: 'net_worth',
    description: 'Patrimoine net de l’utilisateur : actifs, passifs (dettes) et différence, dans sa devise de référence.',
    argsSchema: z.object({}).strict(),
    async execute(context) {
      const report = await reporting.netWorth(context.userId);
      const { magnitude, negative } = split(BigInt(report.netWorthMinor));
      return {
        values: {
          assets: money(report.assetsMinor, report.currency, 'Total des actifs (comptes et sommes dues à l’utilisateur)', {
            key: 'assistant.binding.assets',
          }),
          liabilities: money(report.liabilitiesMinor, report.currency, 'Total des passifs (dettes de l’utilisateur)', {
            key: 'assistant.binding.liabilities',
          }),
          [negative ? 'net_worth_deficit' : 'net_worth']: money(
            magnitude,
            report.currency,
            negative ? 'Patrimoine net négatif : les passifs dépassent les actifs' : 'Patrimoine net : actifs moins passifs',
            { key: negative ? 'assistant.binding.net_worth_deficit' : 'assistant.binding.net_worth' },
          ),
        },
      };
    },
  });
}

/**
 * ADR-0016 §1: `ReportingFacade.budgetVsActual`. The report carries neither currency nor category, so the
 * budgets façade supplies them; the figures are the report's.
 */
export function budgetStatusTool(reporting: ReportingFacade, budgets: BudgetsFacade): Tool {
  return defineTool({
    name: 'budget_status',
    description:
      `Situation des budgets en cours de l’utilisateur (${MAX_BUDGETS} au plus) : montant alloué, dépensé, ` +
      'reste ou dépassement, part consommée. Chaque budget est désigné par son rang et sa catégorie.',
    argsSchema: z.object({}).strict(),
    async execute(context) {
      const [report, definitions] = await Promise.all([reporting.budgetVsActual(context.userId), budgets.list(context.userId)]);
      const byId = new Map(definitions.map((budget) => [budget.id, budget]));
      const values: Record<string, BoundValue> = {};

      report.slice(0, MAX_BUDGETS).forEach((row, index) => {
        const definition = byId.get(row.budgetId);
        if (!definition) return;
        const rank = index + 1;
        const subject = definition.categoryId ? categoryRef(context, definition.categoryId) : 'tous les postes';
        const params = { rank, budgetId: row.budgetId };
        const currency = definition.currency;
        const allocated = BigInt(row.allocatedMinor);
        const spent = BigInt(row.spentMinor);
        values[`allocated_${rank}`] = money(allocated, currency, `Montant alloué au budget n°${rank} (${subject})`, {
          key: 'assistant.binding.budget_allocated',
          params,
        });
        values[`spent_${rank}`] = money(spent, currency, `Montant déjà dépensé sur le budget n°${rank} (${subject})`, {
          key: 'assistant.binding.budget_spent',
          params,
        });
        const { magnitude, negative } = split(BigInt(row.varianceMinor));
        values[`${negative ? 'overrun' : 'remaining'}_${rank}`] = money(
          magnitude,
          currency,
          negative ? `Dépassement du budget n°${rank} (${subject})` : `Reste disponible sur le budget n°${rank} (${subject})`,
          { key: negative ? 'assistant.binding.budget_overrun' : 'assistant.binding.budget_remaining', params },
        );
        const used = shareBasisPoints(spent, allocated);
        if (used !== null) {
          values[`used_pct_${rank}`] = percent(used, `Part consommée du budget n°${rank} (${subject})`, {
            key: 'assistant.binding.budget_used',
            params,
          });
        }
      });
      return { values };
    },
  });
}

/** ADR-0016 §1: `GoalsFacade`. Active goals, by priority. */
export function goalsProgressTool(goals: GoalsFacade): Tool {
  return defineTool({
    name: 'goals_progress',
    description:
      `Objectifs d’épargne actifs de l’utilisateur (${MAX_GOALS} au plus, par priorité) : cible, montant mis de côté, ` +
      'avancement, date visée. Chaque objectif est désigné par son rang.',
    argsSchema: z.object({}).strict(),
    async execute(context) {
      const rows = (await goals.list(context.userId)).filter((goal) => goal.status === 'ACTIVE').slice(0, MAX_GOALS);
      const values: Record<string, BoundValue> = {};
      rows.forEach((goal, index) => {
        const rank = index + 1;
        const params = { rank, goalId: goal.id };
        values[`target_${rank}`] = money(goal.targetMinor, goal.currency, `Montant cible de l’objectif n°${rank}`, {
          key: 'assistant.binding.goal_target',
          params,
        });
        values[`saved_${rank}`] = money(goal.currentMinor, goal.currency, `Montant déjà mis de côté pour l’objectif n°${rank}`, {
          key: 'assistant.binding.goal_saved',
          params,
        });
        const progress = shareBasisPoints(goal.currentMinor, goal.targetMinor);
        if (progress !== null) {
          values[`progress_${rank}`] = percent(progress, `Avancement de l’objectif n°${rank}`, {
            key: 'assistant.binding.goal_progress',
            params,
          });
        }
        if (goal.targetDate) {
          values[`target_date_${rank}`] = date(localDate(goal.targetDate, context.timeZone), `Date visée pour l’objectif n°${rank}`, {
            key: 'assistant.binding.goal_target_date',
            params,
          });
        }
      });
      return { values };
    },
  });
}

/** ADR-0016 §1: `DebtsFacade.summary`. Totals per currency; no counterparty, no debt name (ADR-0019, ADR-0021). */
export function debtsSummaryTool(debts: DebtsFacade): Tool {
  return defineTool({
    name: 'debts_summary',
    description: 'Total des dettes actives de l’utilisateur : ce qu’il doit et ce qu’on lui doit, par devise.',
    argsSchema: z.object({}).strict(),
    async execute(context) {
      const values: Record<string, BoundValue> = {};
      for (const row of await debts.summary(context.userId)) {
        const code = row.currency.toLowerCase();
        const params = { currency: row.currency };
        values[`owed_by_me_${code}`] = money(row.owedByMeMinor, row.currency, `Total que l’utilisateur doit, en ${row.currency}`, {
          key: 'assistant.binding.debts_owed_by_me',
          params,
        });
        values[`owed_to_me_${code}`] = money(row.owedToMeMinor, row.currency, `Total que l’on doit à l’utilisateur, en ${row.currency}`, {
          key: 'assistant.binding.debts_owed_to_me',
          params,
        });
      }
      return { values };
    },
  });
}
