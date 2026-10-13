import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { afterAll, describe, expect, it } from 'vitest';
import { validateEnv } from '../../../common/config/env.schema';
import { MailModule } from '../../../common/mail/mail.module';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { StorageModule } from '../../../common/storage/storage.module';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FakeLlmProvider } from '../../llm/adapters/fake.adapter';
import { LLM_PROVIDER } from '../../llm/llm.facade';
import { AssistantModule } from '../assistant.module';
import { AssistantOrchestrator } from '../assistant.orchestrator';
import { AssistantService } from '../assistant.service';
import { ToolRegistry } from '../tools/tool-registry';
import { buildLive, cleanup, seedDataset } from './live-harness';
import { DECLINE_TOOL_NAME } from '../assistant.orchestrator';

async function boot(env: Record<string, string>, fake: FakeLlmProvider) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        validate: () =>
          validateEnv({
            DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://x',
            JWT_SECRET: 's',
            IP_HASH_SALT: 's',
            NODE_ENV: 'test',
            ...env,
          }),
      }),
      EventEmitterModule.forRoot(),
      PrismaModule,
      MailModule,
      StorageModule,
      AssistantModule,
    ],
  })
    .overrideProvider(LLM_PROVIDER)
    .useValue(fake)
    .compile();
  await moduleRef.init();
  return moduleRef;
}

describe('AssistantModule wiring', () => {
  const closers: (() => Promise<void>)[] = [];
  afterAll(async () => {
    for (const close of closers) await close();
  });

  it('resolves through Nest DI and registers exactly the closed catalogue of ADR-0016', async () => {
    const moduleRef = await boot({}, new FakeLlmProvider());
    closers.push(() => moduleRef.close());

    expect(moduleRef.get(AssistantOrchestrator)).toBeInstanceOf(AssistantOrchestrator);
    expect(moduleRef.get(ToolRegistry).names().sort()).toEqual(
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
    // The model's own refusal tool is the orchestrator's, never a registry tool that could run a query.
    expect(moduleRef.get(ToolRegistry).names()).not.toContain(DECLINE_TOOL_NAME);
  });

  it('is off by default: a booted module answers ASSISTANT_DISABLED and never calls the provider', async () => {
    const fake = new FakeLlmProvider();
    const moduleRef = await boot({}, fake);
    closers.push(() => moduleRef.close());

    await expect(
      moduleRef.get(AssistantService).ask('anyone', { question: 'Bonjour', history: [] }),
    ).rejects.toMatchObject({ code: 'ASSISTANT_DISABLED' });
    expect(fake.requests).toHaveLength(0);
  });

  it('runs a scripted question through the wired module, with limits from the environment (RG-LL2)', async () => {
    const prisma = new PrismaService();
    await prisma.$connect();
    const live = buildLive(prisma);
    const dataset = await seedDataset(prisma, live, 'wiring', 1n);
    const fake = new FakeLlmProvider([
      { toolCalls: [{ name: 'net_worth', arguments: {} }] },
      { text: 'Votre patrimoine net est de {{r1.net_worth}}.' },
    ]);
    const moduleRef = await boot(
      { ASSISTANT_ENABLED: 'true', ASSISTANT_ALLOWLIST: '*', LLM_TIMEOUT_MS: '7000', LLM_MAX_OUTPUT_TOKENS: '300' },
      fake,
    );
    closers.push(async () => {
      await moduleRef.close();
      await cleanup(prisma, [dataset.userId]);
      await prisma.$disconnect();
    });

    const { answer } = await moduleRef
      .get(AssistantService)
      .ask(dataset.userId, { question: 'Quel est mon patrimoine ?', history: [] });

    expect(answer).toMatchObject({ kind: 'template', bindings: { 'r1.net_worth': { type: 'money' } } });
    expect(fake.requests[0]).toMatchObject({ timeoutMs: 7000, maxOutputTokens: 300 });
  });
});
