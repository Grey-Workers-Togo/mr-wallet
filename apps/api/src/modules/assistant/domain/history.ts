import { TemplateViolationCode, PLACEHOLDER_PATTERN, validateTemplate } from './template-validator';

/**
 * ADR-0019 §1 / lot A1.1. The model sees no value, and that includes the values of earlier turns: the
 * client sends back the *template* it was given (`{{r1.total}}`), not the text it showed. A turn that
 * carries a figure would put a number in the request, outside any placeholder — it is refused, with the
 * very check applied to the model's own answers (RG-AT1).
 */

export interface HistoryTurnInput {
  role: 'user' | 'assistant';
  content: string;
}

export type HistoryVerdict = { ok: true } | { ok: false; turn: number; violations: TemplateViolationCode[] };

/** First assistant turn that is not a clean template, by index. User turns are the user's own words. */
export function validateHistory(history: readonly HistoryTurnInput[]): HistoryVerdict {
  for (const [turn, entry] of history.entries()) {
    if (entry.role !== 'assistant') continue;
    // The bindings of a previous turn no longer exist (the system prompt says so): any well-formed name is
    // acceptable here, and only shape, length and stray digits are judged.
    const names = new Set([...entry.content.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1] as string));
    const verdict = validateTemplate(entry.content, names);
    if (!verdict.ok) return { ok: false, turn, violations: verdict.violations };
  }
  return { ok: true };
}

const CALL_INDEX = /\{\{r([1-9][0-9]*)\./g;

/**
 * Highest `rN` an earlier assistant turn mentions. The orchestrator numbers this question's tool calls
 * after it, so `{{r1.total}}` in the history can never be read as the new `r1.total`.
 */
export function highestCallIndex(history: readonly HistoryTurnInput[]): number {
  let highest = 0;
  for (const entry of history) {
    if (entry.role !== 'assistant') continue;
    for (const match of entry.content.matchAll(CALL_INDEX)) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}
