import { LlmUnavailableError } from '../llm.errors';
import type { LlmProvider, LlmRequest, LlmResponse, LlmToolCall, LlmUsage } from '../llm.types';

/** What a scripted step returns. Everything but the content has a deterministic default. */
export interface FakeReply {
  text?: string;
  toolCalls?: { id?: string; name: string; arguments: unknown }[];
  usage?: LlmUsage;
  latencyMs?: number;
  model?: string;
}

/** A step is a reply, an error to throw, or a function of the request (to assert on what was sent). */
export type FakeStep = FakeReply | Error | ((request: LlmRequest) => FakeReply | Error);

export const FAKE_MODEL = 'fake-model';
const DEFAULT_USAGE: LlmUsage = { inputTokens: 100, outputTokens: 20 };

/**
 * ADR-0017 / RG-LL5: scripted, deterministic, no network, no cost. Every call consumes the next step;
 * running out of steps fails loudly so a test never silently depends on an unscripted answer.
 */
export class FakeLlmProvider implements LlmProvider {
  private readonly script: FakeStep[];
  /** Every request received, in order — tests assert on what would have left the server (ADR-0019). */
  readonly requests: LlmRequest[] = [];

  constructor(script: FakeStep[] = []) {
    this.script = [...script];
  }

  enqueue(...steps: FakeStep[]): void {
    this.script.push(...steps);
  }

  get remainingSteps(): number {
    return this.script.length;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(structuredClone(request));
    const step = this.script.shift();
    if (step === undefined) throw new LlmUnavailableError('FAKE_SCRIPT_EXHAUSTED');
    const resolved = typeof step === 'function' ? step(request) : step;
    if (resolved instanceof Error) throw resolved;

    const toolCalls: LlmToolCall[] = (resolved.toolCalls ?? []).map((call, index) => ({
      id: call.id ?? `call_${this.requests.length}_${index + 1}`,
      name: call.name,
      arguments: call.arguments,
    }));
    return {
      text: resolved.text,
      toolCalls,
      usage: resolved.usage ?? DEFAULT_USAGE,
      latencyMs: resolved.latencyMs ?? 1,
      model: resolved.model ?? FAKE_MODEL,
    };
  }
}
