import { Injectable } from '@nestjs/common';
import { LlmFacade } from '../../llm/llm.facade';
import type { ToolSchema } from '../../llm/llm.types';
import type { Tool, ToolContext, ToolRunResult } from './tool-definition';

/** The closed set of functions the model can reach (ADR-0016 §3). Enumerable, read-only, scoped to the caller. */
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(private readonly llm: LlmFacade) {}

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /** RG-LL4: provider schemas are generated from the tools' Zod schemas, in registration order. */
  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((tool) => this.llm.toolSchema(tool.name, tool.description, tool.argsSchema));
  }

  /** RG-AS2: an unknown tool or invalid arguments come back as an error for the model, never executed. */
  async run(name: string, context: ToolContext, rawArguments: unknown): Promise<ToolRunResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: { code: 'TOOL_UNKNOWN' } };
    return tool.run(context, rawArguments);
  }
}
