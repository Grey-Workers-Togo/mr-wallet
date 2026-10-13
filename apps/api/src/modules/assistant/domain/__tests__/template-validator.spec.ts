import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_PATTERN, TEMPLATE_MAX_LENGTH, validateTemplate } from '../template-validator';

const known = new Set(['r1.transport', 'r1.share_transport', 'r1.period', 'r2.transactions']);

function violations(template: string, bindings = known, maxLength?: number) {
  const result = validateTemplate(template, bindings, maxLength);
  return result.ok ? [] : result.violations;
}

describe('validateTemplate — RG-AT1: no digit outside a placeholder', () => {
  it('accepts prose and well-formed placeholders', () => {
    expect(validateTemplate('Vous avez dépensé {{r1.transport}} ({{r1.share_transport}}) en {{r1.period}}.', known)).toEqual({
      ok: true,
    });
    expect(validateTemplate('Je ne trouve aucune dépense sur cette période.', known)).toEqual({ ok: true });
  });

  it('rejects a digit in every position', () => {
    const cases = [
      '5 euros de transport',
      'Transport : 5',
      'Vous avez dépensé 23 500 en transport',
      'abc1def',
      '{{r1.transport}}5',
      '5{{r1.transport}}',
      '{{r1.transport}} et 2 autres',
      'Total{{r1.transport}}2026',
      '0',
      'Ligne un\nligne 2',
    ];
    for (const template of cases) {
      expect(violations(template), JSON.stringify(template)).toContain('DIGIT_OUTSIDE_PLACEHOLDER');
    }
  });

  it('rejects every decimal digit', () => {
    for (const digit of '0123456789') {
      expect(violations(`valeur ${digit}`)).toContain('DIGIT_OUTSIDE_PLACEHOLDER');
    }
  });

  it('rejects digits of other scripts, superscripts and vulgar fractions', () => {
    for (const text of ['٣٠٠ francs', '３００ francs', 'des ² carrés', 'un ½ de plus', 'Ⅻ mois']) {
      expect(violations(text), text).toContain('DIGIT_OUTSIDE_PLACEHOLDER');
    }
  });

  it('ignores digits inside a valid placeholder name, they are the binding index', () => {
    expect(validateTemplate('{{r2.transactions}} opérations', known)).toEqual({ ok: true });
  });

  it('documented gap (ADR-0018): a number spelled out in words is not detected', () => {
    expect(validateTemplate('Vous avez dépensé trois mille francs', known)).toEqual({ ok: true });
  });
});

describe('validateTemplate — RG-AT2: placeholders refer to current bindings', () => {
  it('rejects a binding that does not exist for this question', () => {
    expect(violations('Vous avez dépensé {{r9.transport}}')).toEqual(['UNKNOWN_PLACEHOLDER']);
    expect(violations('{{r1.food}}')).toEqual(['UNKNOWN_PLACEHOLDER']);
  });

  it('rejects an unqualified name, whitespace inside braces and nested braces', () => {
    for (const template of ['{{transport}}', '{{ r1.transport }}', '{{r1.transport}', '{r1.transport}', '{{{{r1.transport}}}}', '}}', '{{}}']) {
      expect(violations(template), template).toContain('MALFORMED_PLACEHOLDER');
    }
  });

  it('reports a malformed placeholder, not a digit, when digits sit inside the braces', () => {
    expect(violations('{{ 25 300 }}')).toEqual(['MALFORMED_PLACEHOLDER']);
  });

  it('does not let a placeholder smuggle a figure in its own name', () => {
    expect(violations('{{r1.transport_25300}}')).toEqual(['UNKNOWN_PLACEHOLDER']);
  });
});

describe('validateTemplate — RG-AT3: bounded length', () => {
  it('accepts exactly the maximum and rejects one more', () => {
    expect(validateTemplate('a'.repeat(TEMPLATE_MAX_LENGTH), known)).toEqual({ ok: true });
    expect(violations('a'.repeat(TEMPLATE_MAX_LENGTH + 1))).toEqual(['TOO_LONG']);
  });

  it('counts code points, so astral characters are not double-counted', () => {
    expect(validateTemplate('😀'.repeat(10), known, 10)).toEqual({ ok: true });
    expect(violations('😀'.repeat(11), known, 10)).toEqual(['TOO_LONG']);
  });

  it('rejects an empty answer', () => {
    expect(violations('   ')).toEqual(['EMPTY']);
  });
});

describe('PLACEHOLDER_PATTERN', () => {
  it('is the pattern the client must render with: it captures the name between the braces', () => {
    const names = [...'a {{r1.transport}} b {{r2.transactions}}'.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]);
    expect(names).toEqual(['r1.transport', 'r2.transactions']);
  });
});
