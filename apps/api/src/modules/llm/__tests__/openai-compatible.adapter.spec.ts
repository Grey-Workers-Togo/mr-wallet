import { describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from '../adapters/openai-compatible.adapter';
import type { LlmRequest } from '../llm.types';

const request: LlmRequest = {
  system: 'system prompt',
  messages: [
    { role: 'user', content: 'question' },
    { role: 'assistant', toolCalls: [{ id: 'call_1', name: 'spending_by_category', arguments: { period: 'this_month' } }] },
    { role: 'tool', toolCallId: 'call_1', content: '{"bindings":{}}' },
  ],
  tools: [{ name: 'spending_by_category', description: 'desc', parameters: { type: 'object' } }],
  maxOutputTokens: 256,
  temperature: 0,
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const okBody = {
  model: 'provider-model-1',
  choices: [{ message: { content: 'Bonjour', tool_calls: [] } }],
  usage: { prompt_tokens: 120, completion_tokens: 30 },
};

function provider(fetchImpl: typeof fetch, overrides: { apiKey?: string } = {}) {
  return new OpenAiCompatibleProvider({
    baseUrl: 'http://llm.test/v1/',
    apiKey: overrides.apiKey ?? 'secret-key',
    model: 'configured-model',
    fetchImpl,
    sleep: async () => undefined,
  });
}

describe('OpenAiCompatibleProvider', () => {
  it('maps the port request to the wire format and the response back (RG-LL2 bounds are sent)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody));
    const response = await provider(fetchImpl as unknown as typeof fetch).complete(request);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'configured-model', max_tokens: 256, temperature: 0 });
    expect(body.messages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(body.messages[2]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'spending_by_category', arguments: '{"period":"this_month"}' } },
      ],
    });
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"bindings":{}}' });
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'spending_by_category', description: 'desc', parameters: { type: 'object' } } },
    ]);

    expect(response).toMatchObject({
      text: 'Bonjour',
      toolCalls: [],
      usage: { inputTokens: 120, outputTokens: 30 },
      model: 'provider-model-1',
    });
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('omits the authorization header for a keyless self-hosted server', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody));
    await provider(fetchImpl as unknown as typeof fetch, { apiKey: '' }).complete(request);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers as Record<string, string>).not.toHaveProperty('authorization');
  });

  it('parses tool calls and passes unparseable arguments through for the tool schema to reject', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ...okBody,
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'a', function: { name: 'cashflow', arguments: '{"period":"last_month"}' } },
                { id: 'b', function: { name: 'cashflow', arguments: '{not json' } },
              ],
            },
          },
        ],
      }),
    );
    const response = await provider(fetchImpl as unknown as typeof fetch).complete(request);
    expect(response.text).toBeUndefined();
    expect(response.toolCalls).toEqual([
      { id: 'a', name: 'cashflow', arguments: { period: 'last_month' } },
      { id: 'b', name: 'cashflow', arguments: '{not json' },
    ]);
  });

  it('retries once on 429 / 5xx and succeeds (RG-LL3)', async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, status))
        .mockResolvedValueOnce(jsonResponse(okBody));
      const response = await provider(fetchImpl as unknown as typeof fetch).complete(request);
      expect(response.text).toBe('Bonjour');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });

  it('retries once on a timeout and on a network error (RG-LL3)', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    for (const failure of [timeout, new TypeError('fetch failed')]) {
      const fetchImpl = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(jsonResponse(okBody));
      await expect(provider(fetchImpl as unknown as typeof fetch).complete(request)).resolves.toMatchObject({
        text: 'Bonjour',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });

  it('reports a repeated timeout with its reason (RG-LL3)', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const fetchImpl = vi.fn().mockRejectedValue(timeout);
    await expect(provider(fetchImpl as unknown as typeof fetch).complete(request)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      params: { reason: 'TIMEOUT' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after exactly one retry with LLM_UNAVAILABLE (RG-LL3)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503));
    await expect(provider(fetchImpl as unknown as typeof fetch).complete(request)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      params: { reason: 'PROVIDER_ERROR', status: 503 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transient rejection (RG-LL3)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad key' }, 401));
    await expect(provider(fetchImpl as unknown as typeof fetch).complete(request)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      params: { reason: 'PROVIDER_REJECTED', status: 401 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a response without usage: cost accounting depends on it (ADR-0017)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...okBody, usage: undefined }));
    await expect(provider(fetchImpl as unknown as typeof fetch).complete(request)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      params: { reason: 'MALFORMED_RESPONSE' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never puts prompt content or provider error bodies in the error it throws (ADR-0019)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'echo: question system prompt' }, 400));
    const error = await provider(fetchImpl as unknown as typeof fetch)
      .complete(request)
      .catch((e: unknown) => e);
    expect(JSON.stringify(error)).not.toContain('question');
    expect(JSON.stringify(error)).not.toContain('system prompt');
  });
});
