import { describe, expect, it } from 'vitest';
import { highestCallIndex, validateHistory } from '../history';

describe('validateHistory — a previous answer comes back as its template, never as rendered text', () => {
  it('accepts user turns as they are and assistant turns made of prose and placeholders', () => {
    expect(
      validateHistory([
        { role: 'user', content: 'Combien en transport en mars 2026 ?' },
        { role: 'assistant', content: 'Vous avez dépensé {{r1.top_1_amount}} en {{r1.period}}.' },
        { role: 'user', content: 'Et le mois dernier ?' },
      ]),
    ).toEqual({ ok: true });
  });

  it('refuses a rendered figure in an assistant turn, whatever its format', () => {
    for (const content of [
      'Vous avez dépensé 23 500 FCFA en transport.',
      'Vous avez dépensé 23500 en transport.',
      'Soit 31,97 % du total.',
      'Du 1er au 30 septembre.',
      'Vous avez dépensé {{r1.top_1_amount}}, soit 3 de plus.',
    ]) {
      const verdict = validateHistory([{ role: 'assistant', content }]);
      expect(verdict, content).toMatchObject({ ok: false, turn: 0 });
      expect(verdict.ok ? [] : verdict.violations).toContain('DIGIT_OUTSIDE_PLACEHOLDER');
    }
  });

  it('says which turn it is', () => {
    const verdict = validateHistory([
      { role: 'user', content: 'Mes dépenses ?' },
      { role: 'assistant', content: 'Vous avez dépensé {{r1.total}}.' },
      { role: 'user', content: 'Et ?' },
      { role: 'assistant', content: 'Environ 500.' },
    ]);
    expect(verdict).toMatchObject({ ok: false, turn: 3 });
  });

  it('refuses a placeholder that is not well formed, and a turn that is too long', () => {
    const malformed = validateHistory([{ role: 'assistant', content: 'Vous avez dépensé {{total}}.' }]);
    expect(malformed.ok ? [] : malformed.violations).toContain('MALFORMED_PLACEHOLDER');

    const long = validateHistory([{ role: 'assistant', content: 'a'.repeat(601) }]);
    expect(long.ok ? [] : long.violations).toContain('TOO_LONG');
  });

  it('does not judge what the user wrote: digits in a question are the user’s own', () => {
    expect(validateHistory([{ role: 'user', content: 'Et en 2025, pour 3 mois ?' }])).toEqual({ ok: true });
  });
});

describe('highestCallIndex — new bindings must not reuse a name the history already used', () => {
  it('is zero without history or without placeholders', () => {
    expect(highestCallIndex([])).toBe(0);
    expect(highestCallIndex([{ role: 'assistant', content: 'Aucune dépense.' }])).toBe(0);
  });

  it('is the highest call index written in an assistant turn', () => {
    expect(
      highestCallIndex([
        { role: 'assistant', content: '{{r1.total}} puis {{r3.expense}}' },
        { role: 'user', content: '{{r9.total}} (un utilisateur n’a pas de repères)' },
        { role: 'assistant', content: '{{r2.income}}' },
      ]),
    ).toBe(3);
  });
});
