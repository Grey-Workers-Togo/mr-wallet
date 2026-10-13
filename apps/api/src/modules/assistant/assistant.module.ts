import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { AssistantOrchestrator } from './assistant.orchestrator';
import { ToolRegistry } from './tools/tool-registry';

/**
 * ADR-0016 §4. Lot A0 is the skeleton: no endpoint, no tool yet. The façade-backed tools, the
 * controller and the flags arrive in A1, where this module also imports reporting, budgets, accounts…
 */
@Module({
  imports: [LlmModule],
  providers: [ToolRegistry, AssistantOrchestrator],
})
export class AssistantModule {}
