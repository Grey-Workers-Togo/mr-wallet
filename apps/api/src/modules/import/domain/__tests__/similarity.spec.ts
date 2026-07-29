import { describe, expect, it } from 'vitest';
import { jaroWinkler } from '../similarity';

describe('jaroWinkler', () => {
  it('is 1 for identical strings', () => {
    expect(jaroWinkler('carrefour paris', 'carrefour paris')).toBe(1);
  });

  it('scores near-identical labels above the 0.85 dedupe threshold', () => {
    expect(jaroWinkler('carrefour paris 15', 'carrefour paris 16')).toBeGreaterThanOrEqual(0.85);
  });

  it('scores unrelated labels low', () => {
    expect(jaroWinkler('carrefour paris', 'salaire mensuel')).toBeLessThan(0.85);
  });
});
