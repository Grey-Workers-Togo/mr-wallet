import { describe, expect, it } from 'vitest';
import { isAllowed, parseAllowlist } from '../access';

describe('assistant access (ADR-0022 §5)', () => {
  it('is closed when the flag is off, whatever the allowlist', () => {
    expect(isAllowed({ enabled: false, allowlist: '*' }, 'u1')).toBe(false);
    expect(isAllowed({ enabled: false, allowlist: 'u1' }, 'u1')).toBe(false);
  });

  it('admits nobody with the flag on and an empty allowlist', () => {
    expect(isAllowed({ enabled: true, allowlist: '' }, 'u1')).toBe(false);
    expect(isAllowed({ enabled: true, allowlist: ' , ' }, 'u1')).toBe(false);
  });

  it('admits only the listed users', () => {
    const config = { enabled: true, allowlist: 'u1, u2' };
    expect(isAllowed(config, 'u1')).toBe(true);
    expect(isAllowed(config, 'u2')).toBe(true);
    expect(isAllowed(config, 'u3')).toBe(false);
  });

  it('admits everyone only with an explicit star', () => {
    expect(isAllowed({ enabled: true, allowlist: '*' }, 'anyone')).toBe(true);
    expect(parseAllowlist('u1,*').everyone).toBe(true);
  });

  it('does not match a user id by prefix', () => {
    expect(isAllowed({ enabled: true, allowlist: 'user-1' }, 'user-10')).toBe(false);
  });
});
