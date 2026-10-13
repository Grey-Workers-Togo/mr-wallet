import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { AskStats } from '../assistant.orchestrator';

export const ASSISTANT_TRACER = Symbol('ASSISTANT_TRACER');

/**
 * RG-AP4: what an observability trace may contain. Metadata only: no question, no answer, no prompt,
 * no tool argument value, no tool result. Adding a text field here is the mistake this type exists to stop.
 */
export interface AssistantTrace {
  /** Pseudonymous: HMAC of the user id with a server secret. Never the id itself. */
  userHash: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  llmLatencyMs: number;
  totalLatencyMs: number;
  estimatedCostMicros: bigint;
  llmCalls: number;
  toolRounds: number;
  toolNames: string[];
  outcome: AskStats['outcome'] | 'cached';
  fallbackReason?: AskStats['fallbackReason'];
  violations: string[];
}

export interface AssistantTracer {
  record(trace: AssistantTrace): Promise<void>;
}

export function pseudonymize(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(userId).digest('hex');
}

export class NoopTracer implements AssistantTracer {
  async record(): Promise<void> {
    // Traces are off unless Langfuse is configured.
  }
}

export interface LangfuseConfig {
  host: string;
  publicKey: string;
  secretKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Langfuse's public ingestion API over `fetch`: no SDK, so nothing here can quietly attach content.
 * Failures never reach the user: a trace is observability, not part of the answer.
 */
export class LangfuseTracer implements AssistantTracer {
  private readonly logger = new Logger(LangfuseTracer.name);

  constructor(private readonly config: LangfuseConfig) {}

  async record(trace: AssistantTrace): Promise<void> {
    const timestamp = new Date().toISOString();
    const body = {
      batch: [
        {
          id: crypto.randomUUID(),
          type: 'trace-create',
          timestamp,
          body: {
            id: crypto.randomUUID(),
            name: 'assistant.ask',
            timestamp,
            userId: trace.userHash,
            metadata: { ...trace, estimatedCostMicros: trace.estimatedCostMicros.toString() },
          },
        },
      ],
    };
    try {
      const response = await (this.config.fetchImpl ?? fetch)(`${this.config.host.replace(/\/$/, '')}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.config.publicKey}:${this.config.secretKey}`).toString('base64')}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) this.logger.warn(`Trace rejected: status ${response.status}`);
    } catch {
      this.logger.warn('Trace not sent');
    }
  }
}
