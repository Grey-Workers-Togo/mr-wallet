import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error';
import { AccountsFacade } from '../accounts/accounts.facade';
import { CategoriesFacade } from '../categories/categories.facade';
import { LlmFacade } from '../llm/llm.facade';
import { UsersFacade } from '../users/users.facade';
import { buildToolContext } from './assistant.context';
import { AssistantDataVersionService } from './assistant-data-version.service';
import { AssistantOrchestrator } from './assistant.orchestrator';
import { AssistantUsageService } from './assistant-usage.service';
import { isAllowed } from './domain/access';
import { AnswerCache, cacheKey } from './domain/answer-cache';
import type { AssistantAnswer } from './domain/bindings';
import { estimateCostMicros, microUsdToXof } from './domain/cost';
import { buildSystemPrompt } from './domain/system-prompt';
import type { AskDto } from './dto/ask.dto';
import { localDate } from './tools/shaping';
import { ASSISTANT_TRACER, pseudonymize, type AssistantTracer } from './tracing/assistant-tracer';

export interface AskResponse {
  answer: AssistantAnswer;
}

export interface AssistantStatus {
  /** Whether a question would be accepted now: flag, allowlist and cost ceiling. */
  enabled: boolean;
  dailyQuota: number;
  remainingToday: number;
}

/**
 * `POST /assistant/ask`. Stateless across questions (RG-AP2): nothing about the question or the answer
 * is stored; the only write is a row of counters (RG-AP3). `userId` always comes from the token (RG-AS3).
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly cache = new AnswerCache();
  private readonly access: { enabled: boolean; allowlist: string };
  private readonly dailyQuota: number;
  private readonly costCeilingMicros: bigint;
  private readonly usdToXofRate: number;
  private readonly traceSecret: string;

  constructor(
    config: ConfigService,
    private readonly llm: LlmFacade,
    private readonly orchestrator: AssistantOrchestrator,
    private readonly usage: AssistantUsageService,
    private readonly dataVersion: AssistantDataVersionService,
    private readonly users: UsersFacade,
    private readonly categories: CategoriesFacade,
    private readonly accounts: AccountsFacade,
    @Inject(ASSISTANT_TRACER) private readonly tracer: AssistantTracer,
  ) {
    this.access = {
      enabled: config.getOrThrow<boolean>('ASSISTANT_ENABLED'),
      allowlist: config.getOrThrow<string>('ASSISTANT_ALLOWLIST'),
    };
    this.dailyQuota = config.getOrThrow<number>('ASSISTANT_DAILY_QUESTION_QUOTA');
    this.costCeilingMicros = BigInt(config.getOrThrow<number>('ASSISTANT_MONTHLY_COST_CEILING_MICROS'));
    this.usdToXofRate = config.getOrThrow<number>('ASSISTANT_USD_TO_XOF_RATE');
    this.traceSecret = config.getOrThrow<string>('ASSISTANT_TRACE_SECRET');
  }

  async status(userId: string, now: Date = new Date()): Promise<AssistantStatus> {
    const requests = await this.usage.requestsToday(userId, now);
    const enabled = isAllowed(this.access, userId) && !(await this.costCeilingReached(now));
    return { enabled, dailyQuota: this.dailyQuota, remainingToday: Math.max(this.dailyQuota - requests, 0) };
  }

  async ask(userId: string, dto: AskDto, now: Date = new Date()): Promise<AskResponse> {
    const startedAt = Date.now();
    await this.assertAvailable(userId, now);

    const context = await buildToolContext(
      { users: this.users, categories: this.categories, accounts: this.accounts },
      userId,
      now,
    );

    // The cache key has no room for the history, so only a question asked on its own is cached.
    let key: string | undefined;
    if (dto.history.length === 0) {
      key = cacheKey({
        userId,
        question: dto.question,
        dataVersion: await this.dataVersion.current(userId),
        localDate: localDate(now, context.timeZone),
      });
      const hit = this.cache.get(key);
      if (hit) {
        await this.trace(userId, 'cached', startedAt, null);
        return { answer: hit };
      }
    }

    // RG-AQ1. A cache hit above costs nothing and takes nothing from the quota.
    if (!(await this.usage.reserve(userId, now, this.dailyQuota))) {
      throw new AppError('ASSISTANT_QUOTA_EXCEEDED', HttpStatus.TOO_MANY_REQUESTS, { limit: this.dailyQuota });
    }

    let result;
    try {
      result = await this.orchestrator.ask({
        question: dto.question,
        history: dto.history,
        systemPrompt: buildSystemPrompt(context.locale),
        context,
      });
    } catch (error) {
      // An outage is not the user's question spent. The error itself is rethrown as it is (LLM_UNAVAILABLE).
      await this.usage.release(userId, now).catch(() => undefined);
      throw error;
    }

    const costMicros = estimateCostMicros(result.stats, this.llm.pricing);
    await this.usage
      .record(userId, now, { inputTokens: result.stats.inputTokens, outputTokens: result.stats.outputTokens, costMicros })
      .catch(() => this.logger.warn('Assistant usage not recorded'));
    await this.trace(userId, result.stats.outcome, startedAt, result.stats, costMicros);

    // A fallback is not cached: asking again may well give the answer this one could not.
    if (key && result.answer.kind !== 'fallback') this.cache.set(key, result.answer);
    return { answer: result.answer };
  }

  /** ADR-0022 §5 and RG-AQ2. Both answer `ASSISTANT_DISABLED`; the reason is a stable id, not a message. */
  private async assertAvailable(userId: string, now: Date): Promise<void> {
    if (!isAllowed(this.access, userId)) {
      throw new AppError('ASSISTANT_DISABLED', HttpStatus.FORBIDDEN, { reason: 'NOT_AVAILABLE' });
    }
    if (await this.costCeilingReached(now)) {
      throw new AppError('ASSISTANT_DISABLED', HttpStatus.FORBIDDEN, { reason: 'COST_CEILING' });
    }
  }

  private async costCeilingReached(now: Date): Promise<boolean> {
    if (this.costCeilingMicros === 0n) return false;
    const spent = await this.usage.monthCostMicros(now);
    if (spent < this.costCeilingMicros) return false;
    // Operations metadata: the amount, never anything about a question.
    this.logger.warn(
      `Assistant monthly cost ceiling reached: ${spent} micro-USD (about ${microUsdToXof(spent, this.usdToXofRate)} XOF)`,
    );
    return true;
  }

  private async trace(
    userId: string,
    outcome: Parameters<AssistantTracer['record']>[0]['outcome'],
    startedAt: number,
    stats: Awaited<ReturnType<AssistantOrchestrator['ask']>>['stats'] | null,
    costMicros = 0n,
  ): Promise<void> {
    await this.tracer
      .record({
        userHash: pseudonymize(userId, this.traceSecret),
        model: stats?.model ?? null,
        inputTokens: stats?.inputTokens ?? 0,
        outputTokens: stats?.outputTokens ?? 0,
        llmLatencyMs: stats?.llmLatencyMs ?? 0,
        totalLatencyMs: Date.now() - startedAt,
        estimatedCostMicros: costMicros,
        llmCalls: stats?.llmCalls ?? 0,
        toolRounds: stats?.toolRounds ?? 0,
        toolNames: stats?.toolNames ?? [],
        outcome,
        fallbackReason: stats?.fallbackReason,
        violations: stats?.violations ?? [],
      })
      .catch(() => undefined);
  }
}
