import { BINDING_NAME_PATTERN } from './bindings';

/**
 * ADR-0018 §2. The model writes `{{r1.transport}}` for every value; the client substitutes. The only
 * check needed is that nothing numeric is left outside a placeholder — exact, no number-format heuristics.
 */

export const TEMPLATE_MAX_LENGTH = 600;

export type TemplateViolationCode =
  /** RG-AT1 */
  | 'DIGIT_OUTSIDE_PLACEHOLDER'
  /** RG-AT2 */
  | 'UNKNOWN_PLACEHOLDER'
  /** A `{{` or `}}` that does not form a well-shaped placeholder. */
  | 'MALFORMED_PLACEHOLDER'
  /** RG-AT3 */
  | 'TOO_LONG'
  | 'EMPTY';

export type TemplateValidation = { ok: true } | { ok: false; violations: TemplateViolationCode[] };

/** Exported so the client renders with the very pattern the server validated against. */
export const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;

/**
 * Any Unicode number (`\p{N}`), not only `0-9`: Arabic-Indic and full-width digits, superscripts and
 * vulgar fractions would otherwise carry a figure past RG-AT1.
 *
 * Known gap, documented in ADR-0018 §Consequences: a number spelled out in words ("trois mille")
 * is not detected. The system prompt forbids it and the evaluation set measures it.
 */
const NUMERIC = /\p{N}/u;

export function validateTemplate(
  template: string,
  knownBindings: ReadonlySet<string>,
  maxLength: number = TEMPLATE_MAX_LENGTH,
): TemplateValidation {
  const violations = new Set<TemplateViolationCode>();

  if (template.trim() === '') violations.add('EMPTY');
  if ([...template].length > maxLength) violations.add('TOO_LONG');

  let outside = '';
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    outside += template.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    const name = match[1] as string;
    if (!BINDING_NAME_PATTERN.test(name)) {
      violations.add('MALFORMED_PLACEHOLDER');
    } else if (!knownBindings.has(name)) {
      violations.add('UNKNOWN_PLACEHOLDER');
    }
  }
  outside += template.slice(cursor);

  if (NUMERIC.test(outside)) violations.add('DIGIT_OUTSIDE_PLACEHOLDER');
  // Braces left over once well-shaped placeholders are removed: `{{r1.x}`, `{{{{r1.x}}}}`, `}}`.
  if (/[{}]/.test(outside)) violations.add('MALFORMED_PLACEHOLDER');

  return violations.size === 0 ? { ok: true } : { ok: false, violations: [...violations] };
}
