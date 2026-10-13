import { formatBinding, type FormatContext } from './format';
import type { AssistantAnswer, Binding, HistoryTurn } from './types';
import { MAX_HISTORY_TURNS } from './types';

/** The same pattern the server validated the template against (`PLACEHOLDER_PATTERN`). */
const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'value'; name: string; binding: Binding; text: string }
  /** A placeholder the response does not carry. The server rejects these (RG-AT2); shown inert if one ever arrives. */
  | { kind: 'missing'; name: string };

/** Splits a template into text and values. A value is always the formatted binding, never model text. */
export function renderTemplate(template: string, bindings: Record<string, Binding>, context: FormatContext): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match.index > cursor) segments.push({ kind: 'text', text: template.slice(cursor, match.index) });
    const name = match[1] ?? '';
    const binding = bindings[name];
    segments.push(
      binding ? { kind: 'value', name, binding, text: formatBinding(binding, context) } : { kind: 'missing', name },
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) segments.push({ kind: 'text', text: template.slice(cursor) });
  return segments;
}

/** The text the user saw, for the history sent with the next question. */
export function plainText(segments: readonly Segment[]): string {
  return segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'value' ? segment.text : '…')).join('');
}

/**
 * RG-AP2: at most the last 6 turns, kept in memory only. A fallback or a refusal carries no prose to
 * send back, so it contributes no turn.
 */
export function historyFor(
  conversation: readonly { question: string; answer: AssistantAnswer | null }[],
  context: FormatContext,
): HistoryTurn[] {
  const turns: HistoryTurn[] = [];
  for (const entry of conversation) {
    if (entry.answer?.kind !== 'template') continue;
    turns.push({ role: 'user', content: entry.question });
    turns.push({
      role: 'assistant',
      content: plainText(renderTemplate(entry.answer.template, entry.answer.bindings, context)),
    });
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}
