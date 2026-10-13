import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmLimits, LlmPricing, LlmProvider, LlmRequest, LlmResponse } from './llm.types';

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * Public interface of the `llm` module (ADR-0017). Business modules call this, never an adapter or a
 * vendor SDK (RG-LL1, CLAUDE.md "Assistant").
 */
@Injectable()
export class LlmFacade {
  /** Per-call bounds from configuration (RG-LL2). Callers pass them in every request. */
  readonly limits: LlmLimits;
  /** Price of the configured model, for cost accounting (RG-AQ3). */
  readonly pricing: LlmPricing;

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    config: ConfigService,
  ) {
    this.limits = {
      timeoutMs: config.getOrThrow<number>('LLM_TIMEOUT_MS'),
      maxOutputTokens: config.getOrThrow<number>('LLM_MAX_OUTPUT_TOKENS'),
    };
    this.pricing = {
      inputMicrosPerMTok: config.getOrThrow<number>('LLM_PRICE_INPUT_MICROS_PER_MTOK'),
      outputMicrosPerMTok: config.getOrThrow<number>('LLM_PRICE_OUTPUT_MICROS_PER_MTOK'),
    };
  }

  complete(request: LlmRequest): Promise<LlmResponse> {
    return this.provider.complete(request);
  }
}
