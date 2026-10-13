import { LlmUnavailableError } from '../llm.errors';
import type { LlmMessage, LlmProvider, LlmRequest, LlmResponse, LlmToolCall } from '../llm.types';

export interface OpenAiCompatibleOptions {
  /** Without the `/chat/completions` suffix. */
  baseUrl: string;
  /** Empty for a self-hosted server that needs none. */
  apiKey: string;
  model: string;
  /** RG-LL3: pause before the single retry. */
  retryDelayMs?: number;
  /** Injected in tests. No vendor SDK is used: the wire protocol is small and our payload stays inspectable (ADR-0017). */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface WireToolCall {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

interface WireResponse {
  model?: unknown;
  choices?: { message?: { content?: unknown; tool_calls?: WireToolCall[] } }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

const DEFAULT_RETRY_DELAY_MS = 250;

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function toWireMessage(message: LlmMessage): Record<string, unknown> {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content ?? null,
        ...(message.toolCalls?.length && {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
          })),
        }),
      };
  }
}

/** Arguments arrive as a JSON string. A string that does not parse is passed through and rejected by the tool's schema (RG-AS2). */
function parseArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * ADR-0017: one adapter per wire protocol. Covers the OpenAI-compatible cloud candidates and Ollama's
 * `/v1` endpoint. Timeout on every call (RG-LL2); one retry on a transient error (RG-LL3).
 * Never logs or puts a prompt, an answer or an argument value in an error (ADR-0019).
 */
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelayMs: number;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const body = JSON.stringify(this.buildBody(request));
    try {
      return await this.attempt(request, body, startedAt);
    } catch (error) {
      if (!(error instanceof TransientError)) throw error;
      await this.sleep(this.retryDelayMs);
    }
    try {
      return await this.attempt(request, body, startedAt);
    } catch (error) {
      if (error instanceof TransientError) throw new LlmUnavailableError(error.reason, error.params);
      throw error;
    }
  }

  private buildBody(request: LlmRequest): Record<string, unknown> {
    return {
      model: this.options.model,
      messages: [{ role: 'system', content: request.system }, ...request.messages.map(toWireMessage)],
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
      ...(request.tools?.length && {
        tools: request.tools.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        })),
      }),
      ...(request.responseSchema && {
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'response', strict: true, schema: request.responseSchema },
        },
      }),
    };
  }

  private async attempt(request: LlmRequest, body: string, startedAt: number): Promise<LlmResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.options.apiKey && { authorization: `Bearer ${this.options.apiKey}` }),
        },
        body,
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new TransientError(timedOut ? 'TIMEOUT' : 'NETWORK_ERROR');
    }

    if (isTransientStatus(response.status)) throw new TransientError('PROVIDER_ERROR', { status: response.status });
    if (!response.ok) throw new LlmUnavailableError('PROVIDER_REJECTED', { status: response.status });

    let payload: WireResponse;
    try {
      payload = (await response.json()) as WireResponse;
    } catch {
      throw new LlmUnavailableError('MALFORMED_RESPONSE');
    }
    return this.toResponse(payload, Date.now() - startedAt);
  }

  private toResponse(payload: WireResponse, latencyMs: number): LlmResponse {
    const message = payload.choices?.[0]?.message;
    const inputTokens = payload.usage?.prompt_tokens;
    const outputTokens = payload.usage?.completion_tokens;
    // `usage` is mandatory (ADR-0017 §1): without it cost and quotas cannot be accounted for.
    if (!message || !isNonNegativeInt(inputTokens) || !isNonNegativeInt(outputTokens)) {
      throw new LlmUnavailableError('MALFORMED_RESPONSE');
    }

    const toolCalls: LlmToolCall[] = [];
    for (const call of message.tool_calls ?? []) {
      if (typeof call.function?.name !== 'string' || typeof call.id !== 'string') {
        throw new LlmUnavailableError('MALFORMED_RESPONSE');
      }
      toolCalls.push({ id: call.id, name: call.function.name, arguments: parseArguments(call.function.arguments) });
    }

    return {
      text: typeof message.content === 'string' && message.content !== '' ? message.content : undefined,
      toolCalls,
      usage: { inputTokens, outputTokens },
      latencyMs,
      model: typeof payload.model === 'string' ? payload.model : this.options.model,
    };
  }
}

/** Internal signal for RG-LL3: eligible for the single retry, converted to `LLM_UNAVAILABLE` if it repeats. */
class TransientError extends Error {
  constructor(
    readonly reason: string,
    readonly params: Record<string, unknown> = {},
  ) {
    super(reason);
  }
}
