import type { AccountsFacade } from '../../accounts/accounts.facade';
import type { BudgetsFacade } from '../../budgets/budgets.facade';
import type { DebtsFacade } from '../../debts/debts.facade';
import type { ForecastingFacade } from '../../forecasting/forecasting.facade';
import type { GoalsFacade } from '../../goals/goals.facade';
import type { ReportingFacade } from '../../reporting/reporting.facade';
import { cashflowForecastTool, cashflowTool, comparePeriodsTool, monthlySummaryTool } from './cashflow.tools';
import { accountBalancesTool, budgetStatusTool, debtsSummaryTool, goalsProgressTool, netWorthTool } from './position.tools';
import { spendingByCategoryTool, topExpensesTool } from './spending.tools';
import type { Tool } from './tool-definition';

export interface ToolFacades {
  reporting: ReportingFacade;
  accounts: AccountsFacade;
  budgets: BudgetsFacade;
  goals: GoalsFacade;
  debts: DebtsFacade;
  forecasting: ForecastingFacade;
}

/** The closed set of ADR-0016 §1: eleven read-only tools, each over an existing façade. */
export function buildToolCatalogue(facades: ToolFacades): Tool[] {
  return [
    spendingByCategoryTool(facades.reporting),
    monthlySummaryTool(facades.reporting),
    cashflowTool(facades.reporting),
    comparePeriodsTool(facades.reporting),
    topExpensesTool(facades.reporting),
    budgetStatusTool(facades.reporting, facades.budgets),
    accountBalancesTool(facades.accounts),
    netWorthTool(facades.reporting),
    cashflowForecastTool(facades.forecasting),
    goalsProgressTool(facades.goals),
    debtsSummaryTool(facades.debts),
  ];
}
