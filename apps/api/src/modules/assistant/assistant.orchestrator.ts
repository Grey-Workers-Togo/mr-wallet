import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmFacade } from '../llm/llm.facade';
import type { LlmMessage, LlmToolCall, ToolSchema } from '../llm/llm.types';
import {
  AssistantAnswer,
  BINDING_KEY_PATTERN,
  Binding,
  BindingLabel,
  DeclineCode,
  SourceRef,
  qualifiedName,
} from './domain/bindings';
import { highestCallIndex } from './domain/history';
import { TemplateViolationCode, validateTemplate } from './domain/template-validator';
import type { ToolContext, ToolError, ToolRunResult } from './tools/tool-definition';
import { ToolRegistry } from './tools/tool-registry';

/** RG-AS4 */
export const MAX_TOOL_ROUNDS = 3;
/** Cost bound inside a round. Not in ADR-0022 §2: a conservative value pending a decision (docs/QUESTIONS.md). */
export const MAX_TOOL_CALLS_PER_ROUND = 5;
/** RG-AP2: the client sends at most this many turns; the orchestrator enforces it again. */
export const MAX_HISTORY_TURNS = 6;
/** ADR-0022 §2 */
export const END_TO_END_TIMEOUT_MS = 20_000;

/** The orchestrator's own tool: the model's only way to refuse (RG-AS5). Never reaches the registry. */
export const DECLINE_TOOL_NAME = 'decline_request';
const declineSchema = z.object({ reason: z.enum(['WRITE_REQUEST', 'FINANCIAL_ADVICE', 'OFF_TOPIC']) }).strict();

export interface ConversationTurn {
  role: 'user' | 'assistant';
  /**
   * For the user, their question. For the assistant, the *template* it was given (`{{r1.total}}`), never
   * the text shown: the model sees no value, including those of earlier turns (ADR-0019 §1).
   */
  content: string;
}

export interface AskInput {
  question: string;
  history?: readonly ConversationTurn[];
  /** French system prompt (lot A1). The orchestrator appends the alias legend to it. */
  systemPrompt: string;
  context: ToolContext;
}

export type FallbackReason = 'VALIDATION' | 'TOOL_ROUNDS_EXHAUSTED' | 'DEADLINE';

/** Metadata only (RG-AP4): enough for quotas, cost and traces, never a question, answer or value. */
export interface AskStats {
  llmCalls: number;
  toolRounds: number;
  toolNames: string[];
  inputTokens: number;
  outputTokens: number;
  llmLatencyMs: number;
  model: string | null;
  outcome: 'accepted' | 'accepted_after_correction' | 'fallback' | 'declined';
  fallbackReason?: FallbackReason;
  violations: TemplateViolationCode[];
}

export interface AskResult {
  answer: AssistantAnswer;
  stats: AskStats;
}

export interface AskOptions {
  deadlineMs?: number;
  /** Monotonic-enough millisecond clock; injected in tests. */
  clock?: () => number;
}

const CORRECTION_PROMPT = (codes: TemplateViolationCode[]): string =>
  `Ta réponse a été rejetée (${codes.join(', ')}). Réécris-la en désignant chaque valeur uniquement par un ` +
  'repère entre doubles accolades, tel que fourni, et sans écrire aucun chiffre.';

function legend(context: ToolContext): string {
  const lines = (entries: readonly { alias: string; name: string }[]) =>
    entries.map((entry) => `${entry.alias}: ${entry.name}`).join('\n');
  const categories = lines(context.aliases.categories.describe());
  const accounts = lines(context.aliases.accounts.describe());
  return [categories && `Catégories :\n${categories}`, accounts && `Comptes :\n${accounts}`].filter(Boolean).join('\n\n');
}

/**
 * ADR-0016 / ADR-0018 / ADR-0022 §2. A bounded loop of a few dozen lines, no framework (ADR-0017):
 * the model picks tools, the code computes, the model writes a template, the code validates it.
 */
@Injectable()
export class AssistantOrchestrator {
  private readonly logger = new Logger(AssistantOrchestrator.name);

  constructor(
    private readonly llm: LlmFacade,
    private readonly registry: ToolRegistry,
  ) {}

  async ask(input: AskInput, options: AskOptions = {}): Promise<AskResult> {
    const clock = options.clock ?? Date.now;
    const deadline = clock() + (options.deadlineMs ?? END_TO_END_TIMEOUT_MS);

    const tools: ToolSchema[] = [
      ...this.registry.schemas(),
      this.llm.toolSchema(
        DECLINE_TOOL_NAME,
        'Refuse la demande : écriture de données, conseil financier, ou sujet sans rapport avec les finances de l’utilisateur.',
        declineSchema,
      ),
    ];
    const system = [input.systemPrompt, legend(input.context)].filter(Boolean).join('\n\n');
    const messages: LlmMessage[] = [
      ...(input.history ?? []).slice(-MAX_HISTORY_TURNS).map((turn): LlmMessage => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: input.question },
    ];

    const bindings: Record<string, Binding> = {};
    const labels: Record<string, BindingLabel> = {};
    const sources: SourceRef[] = [];
    const stats: AskStats = {
      llmCalls: 0,
      toolRounds: 0,
      toolNames: [],
      inputTokens: 0,
      outputTokens: 0,
      llmLatencyMs: 0,
      model: null,
      outcome: 'accepted',
      violations: [],
    };
    // Numbered after the history's own placeholders, so `{{r1.total}}` of an earlier turn is never the new one.
    let callIndex = highestCallIndex(input.history ?? []);
    let corrected = false;

    const fallback = (reason: FallbackReason): AskResult => {
      stats.outcome = 'fallback';
      stats.fallbackReason = reason;
      return { answer: { kind: 'fallback', bindings, labels, sources }, stats };
    };

    for (;;) {
      const remaining = deadline - clock();
      if (remaining <= 0) return fallback('DEADLINE');

      const toolsExhausted = stats.toolRounds >= MAX_TOOL_ROUNDS;
      const response = await this.llm.complete({
        system,
        messages,
        // Once the rounds are spent the model is asked for its answer with nothing left to call.
        tools: toolsExhausted ? undefined : tools,
        maxOutputTokens: this.llm.limits.maxOutputTokens,
        temperature: 0,
        timeoutMs: Math.min(this.llm.limits.timeoutMs, remaining),
      });
      stats.llmCalls += 1;
      stats.inputTokens += response.usage.inputTokens;
      stats.outputTokens += response.usage.outputTokens;
      stats.llmLatencyMs += response.latencyMs;
      stats.model = response.model;

      if (response.toolCalls.length > 0) {
        if (toolsExhausted) return fallback('TOOL_ROUNDS_EXHAUSTED');

        const decline = this.findDecline(response.toolCalls);
        if (decline) {
          stats.outcome = 'declined';
          return { answer: { kind: 'declined', code: decline }, stats };
        }

        stats.toolRounds += 1;
        messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls });
        const executed = response.toolCalls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
        for (const call of executed) {
          callIndex += 1;
          const reply = await this.runTool(call, callIndex, input.context, { bindings, labels, sources, stats });
          messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(reply) });
        }
        for (const skipped of response.toolCalls.slice(MAX_TOOL_CALLS_PER_ROUND)) {
          messages.push({
            role: 'tool',
            toolCallId: skipped.id,
            content: JSON.stringify({ error: { code: 'TOOL_CALL_LIMIT_EXCEEDED' } }),
          });
        }
        continue;
      }

      const template = response.text ?? '';
      const verdict = validateTemplate(template, new Set(Object.keys(bindings)));
      if (verdict.ok) {
        stats.outcome = corrected ? 'accepted_after_correction' : 'accepted';
        return { answer: { kind: 'template', template, bindings, labels, sources }, stats };
      }

      // RG-AT4: exactly one corrective retry; a second rejection never returns the rejected text.
      stats.violations.push(...verdict.violations);
      if (corrected) return fallback('VALIDATION');
      corrected = true;
      messages.push({ role: 'assistant', content: template });
      messages.push({ role: 'user', content: CORRECTION_PROMPT(verdict.violations) });
    }
  }

  private findDecline(calls: readonly LlmToolCall[]): DeclineCode | null {
    for (const call of calls) {
      if (call.name !== DECLINE_TOOL_NAME) continue;
      const parsed = declineSchema.safeParse(call.arguments);
      if (parsed.success) return parsed.data.reason;
    }
    return null;
  }

  private async runTool(
    call: LlmToolCall,
    callIndex: number,
    context: ToolContext,
    state: {
      bindings: Record<string, Binding>;
      labels: Record<string, BindingLabel>;
      sources: SourceRef[];
      stats: AskStats;
    },
  ): Promise<{ results: Record<string, { type: string; description: string }> } | { error: ToolError }> {
    state.stats.toolNames.push(call.name);

    // A malformed `decline_request` reaches here: it is not in the registry, so it comes back as an error.
    let result: ToolRunResult;
    try {
      result = await this.registry.run(call.name, context, call.arguments);
    } catch {
      // Names only: arguments, results and exception messages may carry user data (RG-AP6).
      this.logger.warn(`Assistant tool failed: ${call.name}`);
      return { error: { code: 'TOOL_FAILED' } };
    }
    if (!result.ok) return { error: result.error };

    const entries = Object.entries(result.output.values);
    if (entries.some(([key]) => !BINDING_KEY_PATTERN.test(key))) {
      this.logger.warn(`Assistant tool returned an invalid binding key: ${call.name}`);
      return { error: { code: 'TOOL_FAILED' } };
    }

    const shown: Record<string, { type: string; description: string }> = {};
    for (const [key, { binding, description, label }] of entries) {
      const name = qualifiedName(callIndex, key);
      state.bindings[name] = binding;
      state.labels[name] = label;
      // The model is given the name, the type and what it means — never the value (ADR-0018 §1).
      shown[name] = { type: binding.type, description };
    }
    const { period, comparedTo } = result.output;
    // ADR-0018 §1: the period is a binding too, so an answer never has to write a date or a year.
    for (const [key, covered, text] of [
      ['period', period, 'Période couverte par les chiffres de cet appel'],
      ['compared_period', comparedTo, 'Période de comparaison'],
    ] as const) {
      if (!covered) continue;
      const name = qualifiedName(callIndex, key);
      state.bindings[name] = { type: 'period', from: covered.localFrom, to: covered.localTo };
      state.labels[name] = { key: `assistant.binding.${key}` };
      shown[name] = { type: 'period', description: `${text} (du ${covered.localFrom} au ${covered.localTo})` };
    }
    state.sources.push({
      tool: call.name,
      ...(period && { period: { from: period.localFrom, to: period.localTo } }),
      ...(comparedTo && { comparedWith: { from: comparedTo.localFrom, to: comparedTo.localTo } }),
    });
    return { results: shown };
  }
}
