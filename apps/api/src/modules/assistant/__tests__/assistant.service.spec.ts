import 'reflect-metadata';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIT_METADATA_KEY } from '../../../common/audit/audit.decorator';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FakeLlmProvider, type FakeStep } from '../../llm/adapters/fake.adapter';
import { LlmUnavailableError } from '../../llm/llm.errors';
import { LlmFacade } from '../../llm/llm.facade';
import { AssistantController } from '../assistant.controller';
import { AssistantDataVersionService } from '../assistant-data-version.service';
import { AssistantOrchestrator } from '../assistant.orchestrator';
import { AssistantService } from '../assistant.service';
import { AssistantUsageService } from '../assistant-usage.service';
import { askSchema } from '../dto/ask.dto';
import { buildToolCatalogue } from '../tools/catalogue';
import { ToolRegistry } from '../tools/tool-registry';
import type { AssistantTrace, AssistantTracer } from '../tracing/assistant-tracer';
import { buildLive, cleanup, NOW, seedDataset, type Dataset, type Live } from './live-harness';

const BASE_CONFIG: Record<string, unknown> = {
  LLM_TIMEOUT_MS: 20_000,
  LLM_MAX_OUTPUT_TOKENS: 512,
  LLM_PRICE_INPUT_MICROS_PER_MTOK: 150_000,
  LLM_PRICE_OUTPUT_MICROS_PER_MTOK: 600_000,
  ASSISTANT_ENABLED: true,
  ASSISTANT_ALLOWLIST: '*',
  ASSISTANT_DAILY_QUESTION_QUOTA: 20,
  ASSISTANT_MONTHLY_COST_CEILING_MICROS: 0,
  ASSISTANT_USD_TO_XOF_RATE: 600,
  ASSISTANT_TRACE_SECRET: 'trace-secret',
};

class SpyTracer implements AssistantTracer {
  readonly traces: AssistantTrace[] = [];
  async record(trace: AssistantTrace): Promise<void> {
    this.traces.push(trace);
  }
}

describe('AssistantService — POST /assistant/ask behind the façades (lot A1)', () => {
  const prisma = new PrismaService();
  let live: Live;
  let a: Dataset;
  let b: Dataset;

  beforeAll(async () => {
    await prisma.$connect();
    live = buildLive(prisma);
    a = await seedDataset(prisma, live, 'svc-a', 1n);
    b = await seedDataset(prisma, live, 'svc-b', 7n);
  });

  afterAll(async () => {
    await cleanup(prisma, [a.userId, b.userId]);
    await prisma.$disconnect();
  });

  function build(script: FakeStep[], overrides: Record<string, unknown> = {}) {
    const values = { ...BASE_CONFIG, ...overrides };
    const config = { getOrThrow: (key: string) => values[key] } as unknown as ConfigService;
    const fake = new FakeLlmProvider(script);
    const llm = new LlmFacade(fake, config);
    const registry = new ToolRegistry(llm);
    buildToolCatalogue(live.facades).forEach((tool) => registry.register(tool));
    const tracer = new SpyTracer();
    const usage = new AssistantUsageService(prisma);
    const service = new AssistantService(
      config,
      llm,
      new AssistantOrchestrator(llm, registry),
      usage,
      new AssistantDataVersionService(prisma),
      live.users,
      live.categories,
      live.facades.accounts,
      tracer,
    );
    return { service, fake, tracer, usage };
  }

  const spendingScript = (): FakeStep[] => [
    { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'this_month' } }] },
    { text: 'Ce mois-ci, vous avez dépensé {{r1.total}} sur {{r1.period}}, dont {{r1.top_1_amount}} pour la première catégorie.' },
  ];

  it('answers a question end to end: tool call, bindings, validated template, sources, labels', async () => {
    const { service, fake } = build(spendingScript());

    const { answer } = await service.ask(a.userId, { question: 'Combien ai-je dépensé ce mois-ci ?', history: [] }, NOW);

    expect(answer.kind).toBe('template');
    if (answer.kind !== 'template') return;
    expect(answer.bindings['r1.total']).toEqual({ type: 'money', amountMinor: '73500', currency: 'XOF' });
    expect(answer.bindings['r1.top_1_amount']).toEqual({ type: 'money', amountMinor: '50000', currency: 'XOF' });
    expect(answer.bindings['r1.period']).toEqual({ type: 'period', from: '2026-09-01', to: '2026-09-30' });
    expect(answer.labels['r1.top_1_amount']).toMatchObject({ key: 'assistant.binding.category_total' });
    expect(answer.sources).toEqual([{ tool: 'spending_by_category', period: { from: '2026-09-01', to: '2026-09-30' } }]);
    expect(fake.remainingSteps).toBe(0);
  });

  it('degrades a forced violation to the deterministic fallback, with the computed values and no prose', async () => {
    const { service } = build([
      { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'this_month' } }] },
      { text: 'Vous avez dépensé 73500 francs.' },
      { text: 'Vous avez dépensé 73500 francs.' },
    ]);

    const { answer } = await service.ask(a.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);

    expect(answer.kind).toBe('fallback');
    if (answer.kind !== 'fallback') return;
    expect(answer.bindings['r1.total']).toEqual({ type: 'money', amountMinor: '73500', currency: 'XOF' });
    expect(JSON.stringify(answer)).not.toContain('francs');
  });

  it('RG-AP1/RG-AP6: sends the provider no identifier, no figure and no free-text label', async () => {
    const { service, fake } = build([
      { toolCalls: [{ name: 'top_expenses', arguments: { period: 'this_month', limit: 2 } }] },
      { text: 'Votre plus grosse dépense est {{r1.amount_1}}, le {{r1.date_1}}.' },
    ]);

    const { answer } = await service.ask(a.userId, { question: 'Quelle est ma plus grosse dépense ?', history: [] }, NOW);
    expect(answer.kind).toBe('template');

    const sent = JSON.stringify(fake.requests);
    for (const id of [...a.ids, ...b.ids]) expect(sent).not.toContain(id);
    for (const secret of ['41000', '23500', 'Marché', 'Taxi', 'Objectif secret', 'Budget secret', 'Contrepartie']) {
      expect(sent).not.toContain(secret);
    }
    // What it does receive: the alias legend, built from category and account names (ADR-0019 §1).
    expect(sent).toContain('Alimentation svc-a');
  });

  describe('RG-AS3/RG-AS6: the same question for two users', () => {
    it('answers each from their own data and sends nothing of the other', async () => {
      const first = build(spendingScript());
      const second = build(spendingScript());

      const forA = await first.service.ask(a.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);
      const forB = await second.service.ask(b.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);

      expect(forA.answer).toMatchObject({ bindings: { 'r1.total': { amountMinor: '73500' } } });
      expect(forB.answer).toMatchObject({ bindings: { 'r1.total': { amountMinor: '514500' } } });
      expect(JSON.stringify(first.fake.requests)).not.toContain('svc-b');
      expect(JSON.stringify(second.fake.requests)).not.toContain('svc-a');
    });

    it('does not serve user A a cached answer to user B, for the same words', async () => {
      const { service, fake } = build([...spendingScript(), ...spendingScript()]);

      const forA = await service.ask(a.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);
      const forB = await service.ask(b.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);

      expect(forA.answer).toMatchObject({ bindings: { 'r1.total': { amountMinor: '73500' } } });
      expect(forB.answer).toMatchObject({ bindings: { 'r1.total': { amountMinor: '514500' } } });
      expect(fake.requests).toHaveLength(4);
    });
  });

  describe('access (ADR-0022 §5)', () => {
    it('answers ASSISTANT_DISABLED while the flag is off, without calling the provider', async () => {
      const { service, fake } = build([], { ASSISTANT_ENABLED: false });
      await expect(service.ask(a.userId, { question: 'Bonjour', history: [] }, NOW)).rejects.toMatchObject({
        code: 'ASSISTANT_DISABLED',
      });
      expect(fake.requests).toHaveLength(0);
    });

    it('answers ASSISTANT_DISABLED for a user outside the allowlist, and serves the listed one', async () => {
      const { service } = build(spendingScript(), { ASSISTANT_ALLOWLIST: a.userId });
      await expect(service.ask(b.userId, { question: 'Bonjour', history: [] }, NOW)).rejects.toMatchObject({
        code: 'ASSISTANT_DISABLED',
      });
      const { answer } = await service.ask(a.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);
      expect(answer.kind).toBe('template');
    });

    it('refuses everyone with an empty allowlist even when enabled', async () => {
      const { service } = build([], { ASSISTANT_ALLOWLIST: '' });
      await expect(service.ask(a.userId, { question: 'Bonjour', history: [] }, NOW)).rejects.toMatchObject({
        code: 'ASSISTANT_DISABLED',
      });
    });

    it('reports its availability through status', async () => {
      const open = build([], { ASSISTANT_ALLOWLIST: a.userId });
      expect(await open.service.status(a.userId, NOW)).toMatchObject({ enabled: true, dailyQuota: 20 });
      expect(await open.service.status(b.userId, NOW)).toMatchObject({ enabled: false });
    });
  });

  describe('quota and cost (RG-AQ1–AQ3)', () => {
    it('answers ASSISTANT_QUOTA_EXCEEDED past the daily quota, but still serves a cached question', async () => {
      const user = await seedDataset(prisma, live, 'svc-quota', 1n);
      try {
        const { service } = build([...spendingScript(), { text: 'Bonjour.' }], { ASSISTANT_DAILY_QUESTION_QUOTA: 1 });

        await service.ask(user.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);
        await expect(service.ask(user.userId, { question: 'Autre chose ?', history: [] }, NOW)).rejects.toMatchObject({
          code: 'ASSISTANT_QUOTA_EXCEEDED',
          status: 429,
        });
        // The first question again: a cache hit, free, takes nothing from the quota.
        const again = await service.ask(user.userId, { question: 'combien  ce mois-ci ?', history: [] }, NOW);
        expect(again.answer.kind).toBe('template');
        expect(await service.status(user.userId, NOW)).toMatchObject({ remainingToday: 0 });
      } finally {
        await cleanup(prisma, [user.userId]);
      }
    });

    it('counts tokens and an estimated cost per question, and gives the quota back on an outage', async () => {
      const user = await seedDataset(prisma, live, 'svc-cost', 1n);
      try {
        const { service, usage } = build([
          ...spendingScript(),
          new LlmUnavailableError('PROVIDER_ERROR'),
        ]);

        await service.ask(user.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);
        // 2 calls × (100 in, 20 out) at 150 000 / 600 000 micro-USD per million tokens.
        expect(await prisma.assistantUsage.findFirstOrThrow({ where: { userId: user.userId } })).toMatchObject({
          requests: 1,
          inputTokens: 200,
          outputTokens: 40,
          estimatedCostMicros: 54n,
        });

        await expect(service.ask(user.userId, { question: 'Et le mois dernier ?', history: [] }, NOW)).rejects.toMatchObject({
          code: 'LLM_UNAVAILABLE',
        });
        expect(await usage.requestsToday(user.userId, NOW)).toBe(1);
      } finally {
        await cleanup(prisma, [user.userId]);
      }
    });

    it('answers ASSISTANT_DISABLED once the monthly cost ceiling is reached (RG-AQ2)', async () => {
      const user = await seedDataset(prisma, live, 'svc-ceiling', 1n);
      try {
        const usage = new AssistantUsageService(prisma);
        const baseline = await usage.monthCostMicros(NOW);
        await usage.reserve(user.userId, NOW, 5);
        await usage.record(user.userId, NOW, { inputTokens: 0, outputTokens: 0, costMicros: 10n });

        const { service, fake } = build([], { ASSISTANT_MONTHLY_COST_CEILING_MICROS: Number(baseline + 10n) });
        await expect(service.ask(user.userId, { question: 'Bonjour', history: [] }, NOW)).rejects.toMatchObject({
          code: 'ASSISTANT_DISABLED',
          params: { reason: 'COST_CEILING' },
        });
        expect(fake.requests).toHaveLength(0);
        expect(await service.status(user.userId, NOW)).toMatchObject({ enabled: false });
      } finally {
        await cleanup(prisma, [user.userId]);
      }
    });
  });

  describe('answer cache (ADR-0022 §3)', () => {
    it('serves a repeated question without calling the provider, and recomputes after a write', async () => {
      const user = await seedDataset(prisma, live, 'svc-cache', 1n);
      try {
        const { service, fake } = build([...spendingScript(), ...spendingScript()]);
        const ask = () => service.ask(user.userId, { question: 'Combien ce mois-ci ?', history: [] }, NOW);

        const first = await ask();
        expect(fake.requests).toHaveLength(2);
        const second = await ask();
        expect(fake.requests).toHaveLength(2); // served from memory
        expect(second.answer).toEqual(first.answer);

        await live.transactionsService.create(user.userId, {
          accountId: user.accountId,
          type: 'EXPENSE',
          amountMinor: '1000',
          occurredAt: new Date('2026-09-12T10:00:00Z'),
          description: 'nouveau',
          status: 'CLEARED',
          tagIds: [],
        });
        const third = await ask();
        expect(fake.requests).toHaveLength(4); // the write invalidated it
        expect(third.answer).toMatchObject({ bindings: { 'r1.total': { amountMinor: '74500' } } });
      } finally {
        await cleanup(prisma, [user.userId]);
      }
    });

    it('does not cache a question that carries a history', async () => {
      // The history mentions r1, so this question's tool call is numbered r2.
      const followUp = (): FakeStep[] => [
        { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'this_month' } }] },
        { text: 'Ce mois-ci, vous avez dépensé {{r2.total}}.' },
      ];
      const { service, fake } = build([...followUp(), ...followUp()]);
      const dto = {
        question: 'Et ce mois-ci ?',
        history: [
          { role: 'user' as const, content: 'Combien le mois dernier ?' },
          { role: 'assistant' as const, content: 'Vous avez dépensé {{r1.total}}.' },
        ],
      };
      await service.ask(a.userId, dto, NOW);
      await service.ask(a.userId, dto, NOW);
      expect(fake.requests).toHaveLength(4);
    });

    it('does not cache a fallback', async () => {
      const bad: FakeStep[] = [
        { toolCalls: [{ name: 'net_worth', arguments: {} }] },
        { text: 'Environ 5 francs.' },
        { text: 'Environ 5 francs.' },
      ];
      const { service, fake } = build([...bad, ...bad]);
      const dto = { question: 'Quel est mon patrimoine ?', history: [] };
      expect((await service.ask(a.userId, dto, NOW)).answer.kind).toBe('fallback');
      expect((await service.ask(a.userId, dto, NOW)).answer.kind).toBe('fallback');
      expect(fake.requests).toHaveLength(6);
    });
  });

  it('declines a write request with a stable code (RG-AS5)', async () => {
    const { service } = build([{ toolCalls: [{ name: 'decline_request', arguments: { reason: 'WRITE_REQUEST' } }] }]);
    const { answer } = await service.ask(a.userId, { question: 'Supprime ma dernière dépense', history: [] }, NOW);
    expect(answer).toEqual({ kind: 'declined', code: 'WRITE_REQUEST' });
  });

  it('RG-AP4: traces carry metadata only, under a pseudonymous user hash', async () => {
    const { service, tracer } = build(spendingScript());
    await service.ask(a.userId, { question: 'Combien ai-je dépensé ce mois-ci ?', history: [] }, NOW);

    expect(tracer.traces).toHaveLength(1);
    const [trace] = tracer.traces;
    expect(trace).toMatchObject({
      outcome: 'accepted',
      llmCalls: 2,
      toolRounds: 1,
      toolNames: ['spending_by_category'],
      inputTokens: 200,
      outputTokens: 40,
    });
    const serialized = JSON.stringify({ ...trace, estimatedCostMicros: String(trace?.estimatedCostMicros) });
    expect(serialized).not.toContain(a.userId);
    expect(serialized).not.toMatch(/dépensé|Combien|73500|2026-09/);
    expect(trace?.userHash).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('history carries templates, never values (ADR-0019 §1, lot A1.1)', () => {
    const firstQuestion = 'Combien ai-je dépensé ce mois-ci ?';

    async function firstTurn() {
      const { service } = build(spendingScript());
      const { answer } = await service.ask(a.userId, { question: firstQuestion, history: [] }, NOW);
      if (answer.kind !== 'template') throw new Error('expected a template answer');
      // What the client sends back: the template it was given, not what it rendered.
      return [
        { role: 'user' as const, content: firstQuestion },
        { role: 'assistant' as const, content: answer.template },
      ];
    }

    it('sends the provider no value of a previous answer, only its placeholders', async () => {
      const history = await firstTurn();
      const { service, fake } = build([
        { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'last_month' } }] },
        { text: 'Le mois dernier, vous aviez dépensé {{r2.total}}.' },
      ]);

      const { answer } = await service.ask(a.userId, { question: 'Et le mois dernier ?', history }, NOW);

      expect(answer.kind).toBe('template');
      const sent = JSON.stringify(fake.requests);
      // Every figure and date the first answer was computed from: none is in the request.
      for (const value of ['73500', '73 500', '50000', '50 000', '23500', '2026-09-01', '2026-09-30']) {
        expect(sent, value).not.toContain(value);
      }
      expect(sent).toContain('{{r1.total}}'); // the earlier turn, as the template it was
    });

    it('numbers this question’s bindings after the history’s, so an old placeholder is never a new value', async () => {
      const history = await firstTurn();
      const { service } = build([
        { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'last_month' } }] },
        { text: 'Le mois dernier, vous aviez dépensé {{r2.total}}.' },
      ]);

      const { answer } = await service.ask(a.userId, { question: 'Et le mois dernier ?', history }, NOW);

      expect(answer.kind).toBe('template');
      if (answer.kind !== 'template') return;
      expect(Object.keys(answer.bindings).every((name) => name.startsWith('r2.'))).toBe(true);
      expect(answer.bindings['r2.total']).toEqual({ type: 'money', amountMinor: '42000', currency: 'XOF' });
    });

    it('rejects an answer that reuses a placeholder of an earlier turn, then accepts the correction', async () => {
      const history = await firstTurn();
      const { service, tracer } = build([
        { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'last_month' } }] },
        { text: 'Le mois dernier, vous aviez dépensé {{r1.total}}.' },
        { text: 'Le mois dernier, vous aviez dépensé {{r2.total}}.' },
      ]);

      const { answer } = await service.ask(a.userId, { question: 'Et le mois dernier ?', history }, NOW);

      expect(answer.kind).toBe('template');
      expect(tracer.traces[0]).toMatchObject({ outcome: 'accepted_after_correction', violations: ['UNKNOWN_PLACEHOLDER'] });
    });

    it('refuses a turn that carries a figure, with a code, before anything is spent or sent', async () => {
      const { service, fake, usage } = build(spendingScript());
      const before = await usage.requestsToday(a.userId, NOW);

      await expect(
        service.ask(
          a.userId,
          {
            question: 'Et le mois dernier ?',
            history: [
              { role: 'user', content: firstQuestion },
              { role: 'assistant', content: 'Vous avez dépensé 73 500 FCFA ce mois-ci.' },
            ],
          },
          NOW,
        ),
      ).rejects.toMatchObject({
        code: 'ASSISTANT_HISTORY_INVALID',
        status: 400,
        params: { turn: 1, violations: ['DIGIT_OUTSIDE_PLACEHOLDER'] },
      });

      expect(fake.requests).toHaveLength(0);
      expect(await usage.requestsToday(a.userId, NOW)).toBe(before);
    });
  });

  describe('request shape (RG-AP2)', () => {
    it('accepts a question of 500 characters and a history of 6 turns, and refuses beyond', () => {
      const turn = { role: 'user' as const, content: 'x' };
      expect(askSchema.safeParse({ question: 'q'.repeat(500), history: Array(6).fill(turn) }).success).toBe(true);
      expect(askSchema.safeParse({ question: 'q'.repeat(501) }).success).toBe(false);
      expect(askSchema.safeParse({ question: 'q', history: Array(7).fill(turn) }).success).toBe(false);
      expect(askSchema.safeParse({ question: '   ' }).success).toBe(false);
    });

    it('refuses any field it does not know, userId included (RG-AS3)', () => {
      expect(askSchema.safeParse({ question: 'q', userId: 'someone-else' }).success).toBe(false);
    });
  });

  it('is not audited: the audit log would record the answer (RG-AP1)', () => {
    expect(Reflect.getMetadata(AUDIT_METADATA_KEY, AssistantController.prototype.ask)).toBeUndefined();
  });
});
