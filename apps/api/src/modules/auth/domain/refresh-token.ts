import { randomBytes, createHash } from 'node:crypto';

/** Opaque 256-bit refresh token, stored hashed, never in clear (docs/07 §2). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenMatches(token: string, storedHash: string): boolean {
  return hashRefreshToken(token) === storedHash;
}
