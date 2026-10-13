import { z } from 'zod';
import type { AliasMapper } from '../domain/aliases';
import type { BoundValue } from '../domain/bindings';
import type { ResolvedPeriod } from '../domain/period-resolver';

/**
 * Everything a tool may know about the caller. It is built by the server from the authenticated
 * request and the user's profile — never from model output (RG-AS3).
 */
export interface ToolContext {
  userId: string;
  /** `users.timezone`, applied only to period boundaries (docs/02-architecture.md §7). */
  timeZone: string;
  now: Date;
  aliases: { categories: AliasMapper; accounts: AliasMapper };
}

export interface ToolOutput {
  /** Values keyed by local name; the orchestrator qualifies them (`r1.transport`). */
  values: Record<string, BoundValue>;
  /** The period the figures cover, for RG-AS7 sources. */
  period?: ResolvedPeriod;
  /** The second period of a comparison. */
  comparedTo?: ResolvedPeriod;
}

/** Stable, content-free error handed back to the model so it can correct a call (RG-AS2). */
export interface ToolError {
  code: string;
  details?: { field: string; code: string }[];
}

export type ToolRunResult = { ok: true; output: ToolOutput } | { ok: false; error: ToolError };

/** Thrown by a tool's `execute` for a failure the model can act on, e.g. an alias it was never given. */
export class ToolFailure extends Error {
  constructor(
    readonly code: string,
    readonly details?: { field: string; code: string }[],
  ) {
    super(code);
    this.name = 'ToolFailure';
  }
}

/**
 * A registered tool. The only way to run one is `run`, which validates the arguments first (RG-AS2):
 * there is no path from model output to `execute` that skips the Zod schema.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly argsSchema: z.ZodType;
  run(context: ToolContext, rawArguments: unknown): Promise<ToolRunResult>;
}

export interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  /** One source of truth for the arguments: it validates and generates the provider schema (RG-LL4). */
  argsSchema: S;
  /**
   * Adapts arguments and shapes the result. Business logic belongs to the façade it calls
   * (ADR-0016 §1); `context.userId` is the only identity available (RG-AS3).
   */
  execute(context: ToolContext, args: z.infer<S>): Promise<ToolOutput>;
}

const USER_ID_KEY = /^user_?id$/i;

function hasUserIdProperty(schema: unknown): boolean {
  if (Array.isArray(schema)) return schema.some(hasUserIdProperty);
  if (typeof schema !== 'object' || schema === null) return false;
  return Object.entries(schema).some(
    ([key, value]) =>
      (key === 'properties' && typeof value === 'object' && value !== null && Object.keys(value).some((k) => USER_ID_KEY.test(k))) ||
      hasUserIdProperty(value),
  );
}

export function defineTool<S extends z.ZodType>(spec: ToolSpec<S>): Tool {
  const json = z.toJSONSchema(spec.argsSchema, { io: 'input' });
  if (json.type !== 'object') throw new Error(`Tool ${spec.name}: arguments must be an object`);
  // RG-AS3: the caller's identity is not an argument the model can supply, not even an ignored one.
  if (hasUserIdProperty(json)) throw new Error(`Tool ${spec.name}: arguments must not include a user identifier`);

  return {
    name: spec.name,
    description: spec.description,
    argsSchema: spec.argsSchema,
    async run(context, rawArguments) {
      const parsed = spec.argsSchema.safeParse(rawArguments);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'TOOL_INVALID_ARGUMENTS',
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              code: issue.code.toUpperCase(),
            })),
          },
        };
      }
      try {
        return { ok: true, output: await spec.execute(context, parsed.data) };
      } catch (error) {
        if (error instanceof ToolFailure) return { ok: false, error: { code: error.code, details: error.details } };
        throw error;
      }
    },
  };
}
