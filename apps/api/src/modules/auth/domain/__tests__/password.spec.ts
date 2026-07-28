import { describe, expect, it } from 'vitest';
import { hashPassword, isPasswordAcceptable, verifyPassword } from '../password';

describe('password domain', () => {
  it('hashes and verifies a password with argon2id', async () => {
    const hash = await hashPassword('a-very-strong-password-1', 19456);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'a-very-strong-password-1')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('rejects passwords under 12 characters', () => {
    expect(isPasswordAcceptable('short1234')).toBe(false);
  });

  it('accepts a 12+ character password not on the block-list', () => {
    expect(isPasswordAcceptable('a-very-strong-password-1')).toBe(true);
  });

  it('rejects a known common password', () => {
    expect(isPasswordAcceptable('password123456')).toBe(false);
  });
});
