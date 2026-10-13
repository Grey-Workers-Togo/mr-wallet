import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { buildToolCatalogue } from '../tools/catalogue';
import type { Tool, ToolContext, ToolOutput } from '../tools/tool-definition';
import { buildLive, cleanup, NOW, seedDataset, type Dataset, type Live } from './live-harness';

/** The eleven tools of ADR-0016 §1, against real façades and a real database, for two users. */
describe('assistant tools (RG-AS2, RG-AS3, RG-AS6)', () => {
  const prisma = new PrismaService();
  let live: Live;
  let tools: Map<string, Tool>;
  let a: Dataset;
  let b: Dataset;
  let contextA: ToolContext;
  let contextB: ToolContext;

  beforeAll(async () => {
    await prisma.$connect();
    live = buildLive(prisma);
    tools = new Map(buildToolCatalogue(live.facades).map((tool) => [tool.name, tool]));
    a = await seedDataset(prisma, live, 'a', 1n);
    b = await seedDataset(prisma, live, 'b', 7n);
    contextA = await live.toolContext(a.userId, NOW);
    contextB = await live.toolContext(b.userId, NOW);
  });

  afterAll(async () => {
    await cleanup(prisma, [a.userId, b.userId]);
    await prisma.$disconnect();
  });

  async function run(name: string, context: ToolContext, args: unknown): Promise<ToolOutput> {
    const tool = tools.get(name);
    if (!tool) throw new Error(`no tool ${name}`);
    const result = await tool.run(context, args);
    if (!result.ok) throw new Error(`${name} failed: ${JSON.stringify(result.error)}`);
    return result.output;
  }

  const amounts = (output: ToolOutput): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const [key, value] of Object.entries(output.values)) {
      if (value.binding.type === 'money') found[key] = value.binding.amountMinor;
    }
    return found;
  };
  const percents = (output: ToolOutput): Record<string, number> => {
    const found: Record<string, number> = {};
    for (const [key, value] of Object.entries(output.values)) {
      if (value.binding.type === 'percent') found[key] = value.binding.basisPoints;
    }
    return found;
  };

  it('registers exactly the eleven tools of the ADR', () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        'account_balances',
        'budget_status',
        'cashflow',
        'cashflow_forecast',
        'compare_periods',
        'debts_summary',
        'goals_progress',
        'monthly_summary',
        'net_worth',
        'spending_by_category',
        'top_expenses',
      ].sort(),
    );
  });

  describe('figures come from the existing reports', () => {
    it('spending_by_category: total, ranking and integer shares over the resolved period', async () => {
      const output = await run('spending_by_category', contextA, { period: 'this_month' });
      expect(amounts(output)).toMatchObject({ total: '73500', top_1_amount: '50000', top_2_amount: '23500' });
      expect(percents(output)).toEqual({ top_1_share: 6803, top_2_share: 3197 });
      expect(output.period).toMatchObject({ localFrom: '2026-09-01', localTo: '2026-09-30' });
    });

    it('spending_by_category: one category by alias', async () => {
      const alias = contextA.aliases.categories.aliasFor(a.transportId);
      const output = await run('spending_by_category', contextA, { period: 'this_month', category: alias });
      expect(amounts(output)).toMatchObject({ category_total: '23500', total: '73500' });
      expect(percents(output)).toEqual({ category_share: 3197 });
    });

    it('spending_by_category: the last moment of the local month is counted, the first of the next is not', async () => {
      // 30 Sep 23:30 local (22:30 UTC) belongs to September; 1 Oct 00:30 local (23:30 UTC) to October.
      const edge = await seedDataset(prisma, live, 'edge', 1n);
      try {
        const base = { accountId: edge.accountId, type: 'EXPENSE' as const, status: 'CLEARED' as const, tagIds: [] };
        await live.transactionsService.create(edge.userId, {
          ...base,
          amountMinor: '111',
          occurredAt: new Date('2026-09-30T22:30:00Z'),
          description: 'in',
        });
        await live.transactionsService.create(edge.userId, {
          ...base,
          amountMinor: '222',
          occurredAt: new Date('2026-09-30T23:30:00Z'),
          description: 'out',
        });
        const context = await live.toolContext(edge.userId, NOW);
        const output = await run('spending_by_category', context, { period: 'this_month' });
        expect(amounts(output).total).toBe((73_500 + 111).toString());
      } finally {
        await cleanup(prisma, [edge.userId]);
      }
    });

    it('top_expenses: largest first, local dates, descriptions only in labels', async () => {
      const output = await run('top_expenses', contextA, { period: 'this_month', limit: 2 });
      expect(amounts(output)).toEqual({ amount_1: '41000', amount_2: '23500' });
      expect(output.values.date_1?.binding).toEqual({ type: 'date', value: '2026-09-05' });
      expect(output.values.amount_1?.label.params).toMatchObject({ description: 'Marché a', rank: 1 });
      // What the model is told designates the expense by rank and category alias, never by its label.
      expect(JSON.stringify(Object.values(output.values).map((value) => value.description))).not.toContain('Marché');
    });

    it('cashflow: income, expense and a surplus or deficit, in the key', async () => {
      const output = await run('cashflow', contextA, { period: 'this_month' });
      expect(amounts(output)).toEqual({ income: '300000', expense: '73500', surplus: '226500' });
      const deficit = await run('cashflow', contextA, { period: '2026-08' });
      expect(amounts(deficit)).toEqual({ income: '0', expense: '42000', deficit: '42000' });
    });

    it('monthly_summary: one set of figures per local month, no trailing empty month', async () => {
      const output = await run('monthly_summary', contextA, { period: 'last_3_months' });
      expect(amounts(output)).toMatchObject({
        expense_2026_09: '73500',
        income_2026_09: '300000',
        surplus_2026_09: '226500',
        expense_2026_08: '42000',
        deficit_2026_08: '42000',
        expense_2026_07: '0',
      });
      expect(Object.keys(output.values).some((key) => key.endsWith('_2026_10'))).toBe(false);
    });

    it('compare_periods: difference and percentage in integers; a rise and a fall have different keys', async () => {
      const output = await run('compare_periods', contextA, { current: 'this_month', previous: 'last_month' });
      expect(amounts(output)).toMatchObject({
        expense_current: '73500',
        expense_previous: '42000',
        expense_increase: '31500',
        income_current: '300000',
        income_previous: '0',
        income_increase: '300000',
      });
      // A change against nothing has no percentage rather than a made-up one.
      expect(percents(output)).toEqual({ expense_change_pct: 7500 });
      expect(output.comparedTo).toMatchObject({ localFrom: '2026-08-01', localTo: '2026-08-31' });

      const fall = await run('compare_periods', contextA, { current: 'last_month', previous: 'this_month' });
      expect(amounts(fall)).toMatchObject({ expense_decrease: '31500' });
      expect(Object.keys(fall.values)).not.toContain('expense_increase');
    });

    it('budget_status: allocated, spent, remaining and share; designated by category alias, not by name', async () => {
      const output = await run('budget_status', contextA, {});
      expect(amounts(output)).toEqual({ allocated_1: '50000', spent_1: '20000', remaining_1: '30000' });
      expect(percents(output)).toEqual({ used_pct_1: 4000 });
      const description = output.values.allocated_1?.description ?? '';
      expect(description).toContain(contextA.aliases.categories.aliasFor(a.transportId));
      expect(description).not.toContain('secret');
      expect(output.values.allocated_1?.label.params).toMatchObject({ budgetId: a.budgetId });
    });

    it('account_balances: balance per account alias, optionally one', async () => {
      const alias = contextA.aliases.accounts.aliasFor(a.accountId);
      const all = await run('account_balances', contextA, {});
      expect(amounts(all)).toEqual({ [`balance_${alias}`]: '1184500' });
      const one = await run('account_balances', contextA, { account: alias });
      expect(amounts(one)).toEqual({ [`balance_${alias}`]: '1184500' });
    });

    it('net_worth: assets, liabilities and their difference', async () => {
      const output = await run('net_worth', contextA, {});
      expect(amounts(output)).toEqual({ assets: '1184500', liabilities: '60000', net_worth: '1124500' });
    });

    it('cashflow_forecast: one estimate per month ahead, no more than asked', async () => {
      const output = await run('cashflow_forecast', contextA, { months: 2 });
      expect(Object.keys(output.values).sort()).toEqual(['balance_1', 'balance_2']);
      expect(output.values.balance_1?.description).toContain('estimé');
    });

    it('goals_progress: target, saved, integer progress and local target date; designated by rank', async () => {
      const output = await run('goals_progress', contextA, {});
      expect(amounts(output)).toEqual({ target_1: '1000000', saved_1: '250000' });
      expect(percents(output)).toEqual({ progress_1: 2500 });
      expect(output.values.target_date_1?.binding).toEqual({ type: 'date', value: '2027-06-30' });
      expect(JSON.stringify(Object.values(output.values).map((value) => value.description))).not.toContain('secret');
    });

    it('debts_summary: totals per currency, no debt name and no counterparty', async () => {
      const output = await run('debts_summary', contextA, {});
      expect(amounts(output)).toEqual({ owed_by_me_xof: '60000', owed_to_me_xof: '0' });
      expect(JSON.stringify(output)).not.toMatch(/secr|Contrepartie/);
    });
  });

  describe('subcategories and reconciliation adjustments (RG-A10, lot A1.1)', () => {
    let roll: Dataset;
    let rollContext: ToolContext;
    let taxiId: string;

    beforeAll(async () => {
      roll = await seedDataset(prisma, live, 'roll', 1n);
      const taxi = await prisma.category.create({
        data: { userId: roll.userId, name: 'Taxi roll', kind: 'EXPENSE', parentId: roll.transportId },
      });
      taxiId = taxi.id;
      const base = { accountId: roll.accountId, status: 'CLEARED' as const, tagIds: [] };
      await live.transactionsService.create(roll.userId, {
        ...base,
        type: 'EXPENSE',
        amountMinor: '5000',
        occurredAt: new Date('2026-09-08T08:00:00Z'),
        description: 'Course',
        categoryId: taxi.id,
      });
      const adjust = (type: 'EXPENSE' | 'INCOME', amountMinor: string, at: string) =>
        live.transactionsService.create(
          roll.userId,
          { ...base, status: 'RECONCILED', type, amountMinor, occurredAt: new Date(at), description: 'Ajustement' },
          { source: 'ADJUSTMENT' },
        );
      await adjust('EXPENSE', '700', '2026-09-12T08:00:00Z');
      await adjust('INCOME', '900', '2026-09-13T08:00:00Z');
      await adjust('EXPENSE', '100', '2026-08-14T08:00:00Z');
      rollContext = await live.toolContext(roll.userId, NOW);
    });

    afterAll(async () => {
      await cleanup(prisma, [roll.userId]);
    });

    it('spending_by_category: a parent counts its subcategories, which are not ranked separately', async () => {
      const output = await run('spending_by_category', rollContext, { period: 'this_month' });
      expect(amounts(output)).toMatchObject({
        total: '78500',
        top_1_amount: '50000', // food
        top_2_amount: '28500', // transport 23500 + taxi 5000
        unaccounted: '700',
      });
      expect(Object.keys(output.values)).not.toContain('top_3_amount');
    });

    it('spending_by_category: asking for the parent or for the subcategory gives each its own figure', async () => {
      const parent = rollContext.aliases.categories.aliasFor(roll.transportId);
      const child = rollContext.aliases.categories.aliasFor(taxiId);
      expect(amounts(await run('spending_by_category', rollContext, { period: 'this_month', category: parent }))).toMatchObject({
        category_total: '28500',
      });
      expect(amounts(await run('spending_by_category', rollContext, { period: 'this_month', category: child }))).toMatchObject({
        category_total: '5000',
      });
    });

    it('cashflow: adjustments are out of income and expenses and bound on their own', async () => {
      const output = await run('cashflow', rollContext, { period: 'this_month' });
      expect(amounts(output)).toEqual({
        income: '300000',
        expense: '78500',
        surplus: '221500',
        unaccounted_expense: '700',
        unaccounted_income: '900',
      });
    });

    it('monthly_summary and compare_periods say what they left out, per period', async () => {
      const summary = await run('monthly_summary', rollContext, { period: 'last_3_months' });
      expect(amounts(summary)).toMatchObject({
        expense_2026_09: '78500',
        income_2026_09: '300000',
        unaccounted_expense: '800',
        unaccounted_income: '900',
      });

      const comparison = await run('compare_periods', rollContext, { current: 'this_month', previous: 'last_month' });
      expect(amounts(comparison)).toMatchObject({
        expense_current: '78500',
        expense_previous: '42000',
        income_current: '300000',
        unaccounted_expense_current: '700',
        unaccounted_income_current: '900',
        unaccounted_expense_previous: '100',
      });
      expect(Object.keys(comparison.values)).not.toContain('unaccounted_income_previous');
    });

    it('binds nothing about adjustments for a user who has none, and never user B’s', async () => {
      // `a` and `b` have no adjustment; `roll` has. Nothing of `roll` shows in `a`.
      const output = await run('cashflow', contextA, { period: 'this_month' });
      expect(Object.keys(output.values).some((key) => key.startsWith('unaccounted'))).toBe(false);
    });
  });

  describe('RG-AS6: a tool run for user A never returns user B data', () => {
    const calls: [string, unknown][] = [
      ['spending_by_category', { period: 'this_month' }],
      ['top_expenses', { period: 'this_month', limit: 5 }],
      ['monthly_summary', { period: 'last_3_months' }],
      ['cashflow', { period: 'this_month' }],
      ['compare_periods', { current: 'this_month', previous: 'last_month' }],
      ['budget_status', {}],
      ['account_balances', {}],
      ['net_worth', {}],
      ['cashflow_forecast', { months: 3 }],
      ['goals_progress', {}],
      ['debts_summary', {}],
    ];

    it.each(calls)('%s', async (name, args) => {
      const forA = await run(name, contextA, args);
      const forB = await run(name, contextB, args);

      // B's dataset is 7× A's: every non-zero figure differs, so any shared figure would be a leak.
      const figuresA = Object.values(amounts(forA)).filter((figure) => figure !== '0');
      const figuresB = Object.values(amounts(forB)).filter((figure) => figure !== '0');
      expect(figuresA.length).toBeGreaterThan(0);
      expect(figuresA.filter((figure) => figuresB.includes(figure))).toEqual([]);

      const serializedA = JSON.stringify(forA);
      const serializedB = JSON.stringify(forB);
      for (const id of b.ids) expect(serializedA).not.toContain(id);
      for (const id of a.ids) expect(serializedB).not.toContain(id);
    });

    it('an alias the server never handed out resolves to nothing', async () => {
      const result = await tools.get('spending_by_category')?.run(contextA, { period: 'this_month', category: 'c9' });
      expect(result).toEqual({
        ok: false,
        error: { code: 'UNKNOWN_ALIAS', details: [{ field: 'category', code: 'UNKNOWN_ALIAS' }] },
      });
    });

    it('a model-supplied identifier is not an argument: refused before execution (RG-AS2, RG-AS3)', async () => {
      const result = await tools.get('spending_by_category')?.run(contextA, { period: 'this_month', userId: b.userId });
      expect(result).toMatchObject({ ok: false, error: { code: 'TOOL_INVALID_ARGUMENTS' } });
    });
  });

  it('refuses a stored timezone that is not an IANA name rather than guessing UTC', async () => {
    const bad = await seedDataset(prisma, live, 'badtz', 1n);
    try {
      await prisma.user.update({ where: { id: bad.userId }, data: { timezone: 'Mars/Olympus' } });
      await expect(live.toolContext(bad.userId, NOW)).rejects.toMatchObject({ code: 'USER_TIMEZONE_INVALID' });
    } finally {
      await cleanup(prisma, [bad.userId]);
    }
  });
});
