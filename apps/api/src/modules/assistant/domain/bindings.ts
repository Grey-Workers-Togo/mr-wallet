/**
 * ADR-0018 §1: every value an answer may mention is a typed binding produced by a tool result or by
 * the orchestrator. The model only ever sees a binding's name and description, and writes `{{name}}`.
 */
export type Binding =
  | { type: 'money'; amountMinor: string; currency: string }
  | { type: 'percent'; basisPoints: number }
  /** Local calendar dates in the user's timezone, both inclusive (`YYYY-MM-DD`). */
  | { type: 'period'; from: string; to: string }
  | { type: 'count'; value: number }
  | { type: 'date'; value: string };

export type BindingType = Binding['type'];

/** What a tool returns for one value: the binding plus the description the model is shown. */
export interface BoundValue {
  binding: Binding;
  /** Plain description of what the value is — never the value itself. */
  description: string;
}

/** A tool's local key. The orchestrator prefixes it with the call index: `r1.transport`. */
export const BINDING_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Fully qualified name as written by the model between `{{` and `}}`. */
export const BINDING_NAME_PATTERN = /^r[1-9][0-9]*\.[a-z][a-z0-9_]*$/;

export function qualifiedName(callIndex: number, key: string): string {
  return `r${callIndex}.${key}`;
}

/** One entry of RG-AS7: which tool ran, over which resolved period. */
export interface SourceRef {
  tool: string;
  period?: { from: string; to: string };
}

export type DeclineCode = 'WRITE_REQUEST' | 'FINANCIAL_ADVICE' | 'OFF_TOPIC';

/** ADR-0018 §3. `fallback` carries computed values with no prose: never a wrong figure. */
export type AssistantAnswer =
  | { kind: 'template'; template: string; bindings: Record<string, Binding>; sources: SourceRef[] }
  | { kind: 'fallback'; bindings: Record<string, Binding>; sources: SourceRef[] }
  | { kind: 'declined'; code: DeclineCode; params?: Record<string, string> };
