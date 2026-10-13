/** JSON Schema document, as sent to a provider. Opaque to our code: generated from Zod (RG-LL4). */
export type JsonSchema = Record<string, unknown>;

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Whatever the model produced. Never trusted: validated by the tool's Zod schema (RG-AS2). */
  arguments: unknown;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmRequest {
  system: string;
  /** user / assistant / tool turns */
  messages: LlmMessage[];
  tools?: ToolSchema[];
  /** Structured output (SMS extraction). */
  responseSchema?: JsonSchema;
  /** RG-LL2 */
  maxOutputTokens: number;
  temperature: number;
  /** RG-LL2 */
  timeoutMs: number;
}

/** Mandatory on every response: cost accounting and quotas depend on it (ADR-0017 §1, ADR-0022). */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  text?: string;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
  latencyMs: number;
  model: string;
}

/**
 * The only way business modules reach a language model (ADR-0017, RG-LL1). Adapters implement it;
 * nothing outside the `llm` module imports a vendor SDK or an adapter.
 */
export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Price of the configured model (RG-AQ3), in millionths of a cost unit per million tokens. */
export interface LlmPricing {
  inputMicrosPerMTok: number;
  outputMicrosPerMTok: number;
}

/** Per-call bounds taken from configuration (RG-LL2). */
export interface LlmLimits {
  timeoutMs: number;
  maxOutputTokens: number;
}
