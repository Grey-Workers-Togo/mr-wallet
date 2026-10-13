import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeLlmProvider } from './adapters/fake.adapter';
import { OpenAiCompatibleProvider } from './adapters/openai-compatible.adapter';
import { LlmFacade, LLM_PROVIDER } from './llm.facade';
import type { LlmProvider } from './llm.types';

/** RG-LL1: depends on no other module. The adapter is chosen by configuration only (ADR-0017 §2). */
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        if (config.getOrThrow<string>('LLM_PROVIDER') === 'openai-compatible') {
          return new OpenAiCompatibleProvider({
            baseUrl: config.getOrThrow<string>('LLM_BASE_URL'),
            apiKey: config.getOrThrow<string>('LLM_API_KEY'),
            model: config.getOrThrow<string>('LLM_MODEL'),
          });
        }
        return new FakeLlmProvider();
      },
    },
    LlmFacade,
  ],
  exports: [LlmFacade],
})
export class LlmModule {}
