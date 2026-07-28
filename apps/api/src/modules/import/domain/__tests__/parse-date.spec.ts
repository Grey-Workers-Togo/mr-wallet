import { describe, expect, it } from 'vitest';
import { DateParseError, isDayMonthAmbiguous, parseDateWithFormat } from '../parse-date';

describe('parseDateWithFormat (docs/06 §3)', () => {
  it('parses dd/MM/yyyy', () => {
    const date = parseDateWithFormat('25/12/2026', 'dd/MM/yyyy');
    expect(date.toISOString().slice(0, 10)).toBe('2026-12-25');
  });

  it('parses MM/dd/yyyy', () => {
    const date = parseDateWithFormat('12/25/2026', 'MM/dd/yyyy');
    expect(date.toISOString().slice(0, 10)).toBe('2026-12-25');
  });

  it('parses yyyy-MM-dd', () => {
    const date = parseDateWithFormat('2026-07-12', 'yyyy-MM-dd');
    expect(date.toISOString().slice(0, 10)).toBe('2026-07-12');
  });

  it('rejects an impossible calendar date', () => {
    expect(() => parseDateWithFormat('31/02/2026', 'dd/MM/yyyy')).toThrow(DateParseError);
  });

  it('rejects unparseable input', () => {
    expect(() => parseDateWithFormat('not-a-date', 'dd/MM/yyyy')).toThrow(DateParseError);
  });
});

describe('isDayMonthAmbiguous (docs/06 §3: never guess dd/MM vs MM/dd)', () => {
  it('flags ambiguity when every sampled day is ≤ 12', () => {
    expect(isDayMonthAmbiguous(['01/02/2026', '05/11/2026', '12/03/2026'])).toBe(true);
  });

  it('is not ambiguous once a day > 12 appears', () => {
    expect(isDayMonthAmbiguous(['01/02/2026', '25/11/2026'])).toBe(false);
  });
});
