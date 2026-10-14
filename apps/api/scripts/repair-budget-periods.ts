/**
 * One-off repair of the stored budget periods after the RG-B5 rollover defect (fix/budget-rollover).
 *
 *   npx tsx scripts/repair-budget-periods.ts            # simulation (same as --dry-run), writes nothing
 *   npx tsx scripts/repair-budget-periods.ts --apply    # recompute, one transaction per budget
 *
 * What it recomputes, per non-deleted budget, in chronological order:
 *   - `spentMinor` of each period from the transactions (RG-B3: EXPENSE, no transfer, category and its
 *     children). A budget without a category keeps its stored spending (the service does not compute it);
 *   - `rolloverInMinor` / `allocatedMinor` with `cascadeRollover` (RG-B5), the rule the service now applies.
 *
 * Idempotent: a second run finds nothing to change. No notification is sent: this script emits no event, and
 * for each repaired period `lastAlertPct` is raised to the highest threshold the corrected figures already
 * cross, so a later transaction does not announce an overshoot that is in the past (RG-B6).
 * The output carries counts and totals per currency, never an amount per user.
 *
 * It uses the raw client: soft-deleted rows are excluded explicitly in every query.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { cascadeRollover } from '../src/modules/budgets/domain/rollover';

type Db = Pick<PrismaClient, 'budget' | 'budgetPeriod' | 'transaction' | 'category' | 'auditLog'>;

export interface RepairOptions {
  apply: boolean;
  /** Restricts the run to these users. Not exposed on the command line: for the tests. */
  onlyUserIds?: readonly string[];
}

export interface CurrencyGap {
  periods: number;
  /** Sum of |stored − correct| over `allocatedMinor`, in minor units of the currency. */
  allocatedGapMinor: bigint;
  /** Sum of |stored − correct| over `spentMinor`. */
  spentGapMinor: bigint;
}

export interface RepairReport {
  mode: 'dry-run' | 'apply';
  budgetsScanned: number;
  users: number;
  budgets: number;
  periods: number;
  byCurrency: Record<string, CurrencyGap>;
}

const abs = (value: bigint): bigint => (value < 0n ? -value : value);

interface PeriodValues {
  allocatedMinor: bigint;
  rolloverInMinor: bigint;
  spentMinor: bigint;
  lastAlertPct: number | null;
}

interface PeriodChange {
  id: string;
  userId: string;
  before: PeriodValues;
  after: PeriodValues;
}

type BudgetRow = Prisma.BudgetGetPayload<Record<string, never>>;

/** Reads the budget's periods and spending and returns the periods that differ from what the rule gives. */
async function planBudget(db: Db, budget: BudgetRow): Promise<PeriodChange[]> {
  const periods = await db.budgetPeriod.findMany({
    where: { budgetId: budget.id, deletedAt: null },
    orderBy: { periodStart: 'asc' },
  });
  if (periods.length === 0) return [];

  let scopeIds: string[] | null = null;
  if (budget.categoryId) {
    const children = await db.category.findMany({
      where: { userId: budget.userId, parentId: budget.categoryId, deletedAt: null },
      select: { id: true },
    });
    scopeIds = [budget.categoryId, ...children.map((child) => child.id)];
  }

  const spent: bigint[] = [];
  for (const period of periods) {
    if (!scopeIds) {
      spent.push(period.spentMinor);
      continue;
    }
    const sum = await db.transaction.aggregate({
      where: {
        userId: budget.userId,
        categoryId: { in: scopeIds },
        type: 'EXPENSE',
        transferGroupId: null,
        deletedAt: null,
        occurredAt: { gte: period.periodStart, lt: period.periodEnd },
      },
      _sum: { amountMinor: true },
    });
    spent.push(sum._sum.amountMinor ?? 0n);
  }

  const allocations = cascadeRollover(budget.amountMinor, budget.rollover, spent.map((spentMinor) => ({ spentMinor })));
  const changes: PeriodChange[] = [];
  periods.forEach((period, index) => {
    const allocation = allocations[index]!;
    const spentMinor = spent[index]!;
    const unchanged =
      period.allocatedMinor === allocation.allocatedMinor &&
      period.rolloverInMinor === allocation.rolloverInMinor &&
      period.spentMinor === spentMinor;
    if (unchanged) return;

    // No retroactive alert: what the corrected figures already cross is recorded as announced.
    let lastAlertPct = period.lastAlertPct;
    if (allocation.allocatedMinor > 0n) {
      const pct = Number((spentMinor * 10000n) / allocation.allocatedMinor) / 100;
      const crossed = budget.alertThresholds.filter((threshold) => pct >= threshold);
      if (crossed.length > 0) {
        const highest = Math.max(...crossed);
        if (lastAlertPct === null || lastAlertPct < highest) lastAlertPct = highest;
      }
    }

    changes.push({
      id: period.id,
      userId: period.userId,
      before: {
        allocatedMinor: period.allocatedMinor,
        rolloverInMinor: period.rolloverInMinor,
        spentMinor: period.spentMinor,
        lastAlertPct: period.lastAlertPct,
      },
      after: { allocatedMinor: allocation.allocatedMinor, rolloverInMinor: allocation.rolloverInMinor, spentMinor, lastAlertPct },
    });
  });
  return changes;
}

const asJson = (values: PeriodValues): Prisma.InputJsonObject => ({
  allocatedMinor: values.allocatedMinor.toString(),
  rolloverInMinor: values.rolloverInMinor.toString(),
  spentMinor: values.spentMinor.toString(),
  lastAlertPct: values.lastAlertPct,
});

async function writeChanges(db: Db, changes: readonly PeriodChange[]): Promise<void> {
  for (const change of changes) {
    await db.budgetPeriod.update({ where: { id: change.id }, data: change.after });
    await db.auditLog.create({
      data: {
        userId: change.userId,
        actorType: 'SYSTEM',
        action: 'budget_period.repair',
        entityType: 'BudgetPeriod',
        entityId: change.id,
        before: asJson(change.before),
        after: asJson(change.after),
        metadata: { script: 'repair-budget-periods', rule: 'RG-B5' },
      },
    });
  }
}

export async function repairBudgetPeriods(prisma: PrismaClient, options: RepairOptions): Promise<RepairReport> {
  const report: RepairReport = {
    mode: options.apply ? 'apply' : 'dry-run',
    budgetsScanned: 0,
    users: 0,
    budgets: 0,
    periods: 0,
    byCurrency: {},
  };
  const touchedUsers = new Set<string>();

  const budgets = await prisma.budget.findMany({
    where: { deletedAt: null, ...(options.onlyUserIds && { userId: { in: [...options.onlyUserIds] } }) },
    orderBy: { id: 'asc' },
  });
  for (const budget of budgets) {
    report.budgetsScanned += 1;

    // The reads and the writes of a budget are one transaction: a transaction recorded meanwhile is not lost.
    const changes = options.apply
      ? await prisma.$transaction(async (tx) => {
          const planned = await planBudget(tx, budget);
          await writeChanges(tx, planned);
          return planned;
        })
      : await planBudget(prisma, budget);
    if (changes.length === 0) continue;

    report.budgets += 1;
    report.periods += changes.length;
    touchedUsers.add(budget.userId);
    const gap = (report.byCurrency[budget.currency] ??= { periods: 0, allocatedGapMinor: 0n, spentGapMinor: 0n });
    for (const change of changes) {
      gap.periods += 1;
      gap.allocatedGapMinor += abs(change.after.allocatedMinor - change.before.allocatedMinor);
      gap.spentGapMinor += abs(change.after.spentMinor - change.before.spentMinor);
    }
  }
  report.users = touchedUsers.size;
  return report;
}

function parseArgs(argv: readonly string[]): RepairOptions {
  const apply = argv.includes('--apply');
  if (apply && argv.includes('--dry-run')) throw new Error('--apply and --dry-run are exclusive');
  const unknown = argv.filter((arg) => arg !== '--apply' && arg !== '--dry-run');
  if (unknown.length > 0) throw new Error(`Unknown argument: ${unknown.join(' ')}`);
  return { apply };
}

/** The database the script is about to read or write: host and name, never the credentials. */
function target(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.pathname}`;
  } catch {
    return 'unknown (DATABASE_URL missing or unparsable)';
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    process.stdout.write(`repair-budget-periods: ${options.apply ? 'APPLY' : 'dry-run (nothing is written)'} on ${target()}
`);
    const report = await repairBudgetPeriods(prisma, options);
    process.stdout.write(`${JSON.stringify(report, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}
`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
