import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { FakeLlmProvider, type FakeStep } from '../../llm/adapters/fake.adapter';
import { LlmFacade } from '../../llm/llm.facade';
import { AssistantOrchestrator } from '../assistant.orchestrator';
import { AliasMapper } from '../domain/aliases';
import { resolvePeriod, symbolicPeriodSchema } from '../domain/period-resolver';
import { shareBasisPoints } from '../domain/derived';
import { defineTool, ToolFailure, type Tool, type ToolContext } from '../tools/tool-definition';
import { ToolRegistry } from '../tools/tool-registry';

/** Two users whose data must never mix (RG-AS6). Amounts are XOF minor units (minorUnits = 0). */
export const DATA: Record<string, { categories: { id: string; name: string; spentMinor: bigint }[]; totalMinor: bigint }> = {
  'user-a-secret-id': {
    categories: [
      { id: 'cat-a-transport', name: 'Transport', spentMinor: 23_500n },
      { id: 'cat-a-food', name: 'Alimentation', spentMinor: 41_000n },
    ],
    totalMinor: 64_500n,
  },
  'user-b-secret-id': {
    categories: [{ id: 'cat-b-transport', name: 'Transport', spentMinor: 999_000n }],
    totalMinor: 999_000n,
  },
};

export const NOW = new Date('2026-09-15T10:00:00Z');

export function contextFor(userId: string): ToolContext {
  const user = DATA[userId];
  if (!user) throw new Error(`unknown test user ${userId}`);
  return {
    userId,
    timeZone: 'Africa/Porto-Novo',
    now: NOW,
    aliases: {
      categories: new AliasMapper('c', user.categories),
      accounts: new AliasMapper('a', [{ id: `acc-${userId}`, name: 'Flooz' }]),
    },
  };
}

export interface ToolSpy {
  executions: { userId: string; args: unknown }[];
}

/** Stand-in for `spending_by_category`: shapes a façade-like result, holds no business logic. */
export function spendingTool(spy: ToolSpy = { executions: [] }): Tool {
  return defineTool({
    name: 'spending_by_category',
    description: 'Dépenses par catégorie sur une période.',
    argsSchema: z.object({ period: symbolicPeriodSchema, category: z.string().regex(/^c\d+$/).optional() }).strict(),
    async execute(context, args) {
      spy.executions.push({ userId: context.userId, args });
      const data = DATA[context.userId];
      if (!data) throw new Error('no data');
      let spent = data.totalMinor;
      if (args.category) {
        const id = context.aliases.categories.resolve(args.category);
        const category = data.categories.find((c) => c.id === id);
        if (!category) throw new ToolFailure('UNKNOWN_ALIAS', [{ field: 'category', code: 'UNKNOWN_ALIAS' }]);
        spent = category.spentMinor;
      }
      const share = shareBasisPoints(spent, data.totalMinor) ?? 0;
      return {
        period: resolvePeriod(args.period, { now: context.now, timeZone: context.timeZone }),
        values: {
          total: { binding: { type: 'money', amountMinor: spent.toString(), currency: 'XOF' }, description: 'Total dépensé' },
          share: { binding: { type: 'percent', basisPoints: share }, description: 'Part du total des dépenses' },
        },
      };
    },
  });
}

export function harness(script: FakeStep[], tools: Tool[] = [spendingTool()]) {
  const fake = new FakeLlmProvider(script);
  const limits = {
    LLM_TIMEOUT_MS: 20_000,
    LLM_MAX_OUTPUT_TOKENS: 512,
    LLM_PRICE_INPUT_MICROS_PER_MTOK: 0,
    LLM_PRICE_OUTPUT_MICROS_PER_MTOK: 0,
  } as Record<string, number>;
  const config = { getOrThrow: (key: string) => limits[key] } as unknown as ConfigService;
  const llm = new LlmFacade(fake, config);
  const registry = new ToolRegistry(llm);
  tools.forEach((tool) => registry.register(tool));
  return { fake, llm, registry, orchestrator: new AssistantOrchestrator(llm, registry) };
}

export const SYSTEM_PROMPT = 'Tu réponds aux questions sur les finances de l’utilisateur.';
