import 'reflect-metadata';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedClock, systemClock, type Clock } from '../../../common/clock/clock';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FakeLlmProvider, type FakeStep } from '../../llm/adapters/fake.adapter';
import { LlmFacade } from '../../llm/llm.facade';
import { AssistantDataVersionService } from '../assistant-data-version.service';
import { AssistantOrchestrator } from '../assistant.orchestrator';
import { AssistantService } from '../assistant.service';
import { AssistantUsageService } from '../assistant-usage.service';
import { buildToolCatalogue } from '../tools/catalogue';
import { ToolRegistry } from '../tools/tool-registry';
import { buildLive, cleanup, seedDataset, type Dataset } from './live-harness';

/**
 * The injectable clock (lot A2 prerequisite). No `now` is handed to `ask`: what the assistant reads as
 * "now" comes from the `CLOCK` provider alone, through the period resolver, the cache date and the
 * façades the tools call. The real date of these tests is not September 2026.
 */
const CONFIG: Record<string, unknown> = {
  LLM_TIMEOUT_MS: 20_000,
  LLM_MAX_OUTPUT_TOKENS: 512,
  LLM_PRICE_INPUT_MICROS_PER_MTOK: 0,
  LLM_PRICE_OUTPUT_MICROS_PER_MTOK: 0,
  ASSISTANT_ENABLED: true,
  ASSISTANT_ALLOWLIST: '*',
  ASSISTANT_DAILY_QUESTION_QUOTA: 20,
  ASSISTANT_MONTHLY_COST_CEILING_MICROS: 0,
  ASSISTANT_USD_TO_XOF_RATE: 600,
  ASSISTANT_TRACE_SECRET: 'trace-secret',
};

const noTrace = { record: async () => undefined };

describe('assistant — injectable clock', () => {
  const prisma = new PrismaService();
  let dataset: Dataset;

  beforeAll(async () => {
    await prisma.$connect();
    // The dataset is seeded with the system clock: seeding is not what is under test.
    dataset = await seedDataset(prisma, buildLive(prisma), 'clock', 1n);
    // A budget whose only period is September 2026: it is "current" on the 30th, and at no other time.
    await prisma.budgetPeriod.deleteMany({ where: { budgetId: dataset.budgetId } });
    await prisma.budgetPeriod.create({
      data: {
        userId: dataset.userId,
        budgetId: dataset.budgetId,
        periodStart: new Date('2026-09-01T00:00:00Z'),
        periodEnd: new Date('2026-10-01T00:00:00Z'),
        allocatedMinor: 77_000n,
        spentMinor: 12_000n,
      },
    });
  });

  afterAll(async () => {
    await cleanup(prisma, [dataset.userId]);
    await prisma.$disconnect();
  });

  function serviceAt(clock: Clock, script: FakeStep[]) {
    const config = { getOrThrow: (key: string) => CONFIG[key] } as unknown as ConfigService;
    const live = buildLive(prisma, clock);
    const llm = new LlmFacade(new FakeLlmProvider(script), config);
    const registry = new ToolRegistry(llm);
    buildToolCatalogue(live.facades).forEach((tool) => registry.register(tool));
    return new AssistantService(
      config,
      llm,
      new AssistantOrchestrator(llm, registry),
      new AssistantUsageService(prisma),
      new AssistantDataVersionService(prisma),
      live.users,
      live.categories,
      live.facades.accounts,
      noTrace,
      clock,
    );
  }

  const thisMonth = (): FakeStep[] => [
    { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'this_month' } }] },
    { text: 'Ce mois-ci, vous avez dépensé {{r1.total}} sur {{r1.period}}.' },
  ];

  it('"ce mois-ci" is September when the clock is frozen on 2026-09-30', async () => {
    const service = serviceAt(fixedClock(new Date('2026-09-30T12:00:00Z')), thisMonth());

    const { answer } = await service.ask(dataset.userId, { question: 'Combien ai-je dépensé ce mois-ci ?', history: [] });

    expect(answer.kind).toBe('template');
    if (answer.kind !== 'template') return;
    expect(answer.bindings['r1.period']).toEqual({ type: 'period', from: '2026-09-01', to: '2026-09-30' });
    expect(answer.bindings['r1.total']).toEqual({ type: 'money', amountMinor: '73500', currency: 'XOF' });
  });

  it('follows the clock and not the wall time: the day after, the same question is October', async () => {
    const service = serviceAt(fixedClock(new Date('2026-10-01T12:00:00Z')), thisMonth());

    const { answer } = await service.ask(dataset.userId, { question: 'Combien ai-je dépensé ce mois-ci ?', history: [] });

    expect(answer.kind).toBe('template');
    if (answer.kind !== 'template') return;
    expect(answer.bindings['r1.period']).toEqual({ type: 'period', from: '2026-10-01', to: '2026-10-31' });
    expect(answer.bindings['r1.total']).toEqual({ type: 'money', amountMinor: '0', currency: 'XOF' });
  });

  it('reads the current budget through the clock too', async () => {
    const script: FakeStep[] = [
      { toolCalls: [{ name: 'budget_status', arguments: {} }] },
      { text: 'Il reste {{r1.remaining_1}} sur votre budget, soit {{r1.used_pct_1}} consommé.' },
    ];

    const frozen = serviceAt(fixedClock(new Date('2026-09-30T12:00:00Z')), script);
    const { answer } = await frozen.ask(dataset.userId, { question: 'Où en est mon budget ?', history: [] });
    expect(answer.kind).toBe('template');
    if (answer.kind !== 'template') return;
    expect(answer.bindings['r1.remaining_1']).toEqual({ type: 'money', amountMinor: '65000', currency: 'XOF' });

    // On 2026-11-15 the September period is no longer current: nothing to bind, so the template fails
    // validation and falls back to the deterministic table, with no budget in it.
    const later = serviceAt(fixedClock(new Date('2026-11-15T12:00:00Z')), [
      { toolCalls: [{ name: 'budget_status', arguments: {} }] },
      { text: 'Il reste {{r1.remaining_1}}.' },
      { text: 'Il reste {{r1.remaining_1}}.' },
    ]);
    const after = await later.ask(dataset.userId, { question: 'Où en est mon budget ?', history: [] });
    expect(after.answer.kind).toBe('fallback');
    if (after.answer.kind !== 'fallback') return;
    expect(Object.keys(after.answer.bindings)).not.toContain('r1.remaining_1');
  });

  it('starts the forecast after the frozen month', async () => {
    const service = serviceAt(fixedClock(new Date('2026-09-30T12:00:00Z')), [
      { toolCalls: [{ name: 'cashflow_forecast', arguments: { months: 2 } }] },
      { text: 'Fin du premier mois à venir : {{r1.balance_1}}.' },
    ]);

    const { answer } = await service.ask(dataset.userId, { question: 'Quel solde le mois prochain ?', history: [] });

    expect(answer.kind).toBe('template');
    if (answer.kind !== 'template') return;
    expect(answer.labels['r1.balance_1']).toMatchObject({ params: { month: '2026-10', rank: 1 } });
  });

  it('keeps the system clock by default', async () => {
    const before = Date.now();
    const at = systemClock.now().getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
});
