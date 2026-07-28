import * as argon2 from 'argon2';

/** Never MD5, SHA-family, or bcrypt — Argon2id only (docs/07 §2). */
export async function hashPassword(password: string, memoryCost: number): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

const COMMON_PASSWORDS = new Set(['password123456', '123456789012', 'qwertyuiop12']);

/**
 * 12 chars minimum, rejected against a small local block-list — no composition rules
 * (docs/07 §2: uppercase/digit/symbol requirements degrade real-world password quality).
 * A full HIBP/zxcvbn check is a follow-up, not blocking for Lot 1.
 */
export function isPasswordAcceptable(password: string): boolean {
  if (password.length < 12) return false;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return false;
  return true;
}
