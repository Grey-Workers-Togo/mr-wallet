import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashRefreshToken, refreshTokenMatches } from '../refresh-token';

describe('refresh token domain', () => {
  it('generates a unique 256-bit token each call', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(32);
  });

  it('hashes deterministically for storage comparison', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it('matches a token against its stored hash', () => {
    const token = generateRefreshToken();
    const stored = hashRefreshToken(token);
    expect(refreshTokenMatches(token, stored)).toBe(true);
    expect(refreshTokenMatches('wrong-token', stored)).toBe(false);
  });
});
