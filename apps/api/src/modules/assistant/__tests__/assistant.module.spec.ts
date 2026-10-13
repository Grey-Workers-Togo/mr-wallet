import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../../common/config/env.schema';
import { FakeLlmProvider } from '../../llm/adapters/fake.adapter';
import { LLM_PROVIDER } from '../../llm/llm.facade';
import { AssistantModule } from '../assistant.module';
import { AssistantOrchestrator } from '../assistant.orchestrator';
import { ToolRegistry } from '../tools/tool-registry';
import { contextFor, spendingTool, SYSTEM_PROMPT } from './harness';

async function boot(env: Record<string, string>, fake: FakeLlmProvider) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        validate: () => validateEnv({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 's', IP_HASH_SALT: 's', ...env }),
      }),
      AssistantModule,
    ],
  })
    .overrideProvider(LLM_PROVIDER)
    .useValue(fake)
    .compile();
  return moduleRef;
}

describe('AssistantModule wiring', () => {
  it('resolves the orchestrator and registry through Nest DI and runs a scripted question', async () => {
    const fake = new FakeLlmProvider([
      { toolCalls: [{ name: 'spending_by_category', arguments: { period: 'this_month' } }] },
      { text: 'Vous avez dépensé {{r1.total}}.' },
    ]);
    const moduleRef = await boot({}, fake);
    moduleRef.get(ToolRegistry).register(spendingTool());

    const { answer } = await moduleRef.get(AssistantOrchestrator).ask({
      question: 'Combien ce mois-ci ?',
      systemPrompt: SYSTEM_PROMPT,
      context: contextFor('user-a-secret-id'),
    });

    expect(answer.kind).toBe('template');
  });

  it('takes its call bounds from the validated environment (RG-LL2)', async () => {
    const fake = new FakeLlmProvider([{ text: 'ok' }]);
    const moduleRef = await boot({ LLM_TIMEOUT_MS: '7000', LLM_MAX_OUTPUT_TOKENS: '300' }, fake);

    await moduleRef.get(AssistantOrchestrator).ask({
      question: 'Bonjour',
      systemPrompt: SYSTEM_PROMPT,
      context: contextFor('user-a-secret-id'),
    });

    expect(fake.requests[0]).toMatchObject({ timeoutMs: 7000, maxOutputTokens: 300 });
  });
});
