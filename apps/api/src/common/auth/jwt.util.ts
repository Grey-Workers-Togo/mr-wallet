import jwt, { SignOptions } from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string; // userId
  sessionId: string;
}

/**
 * Access token: 15 min JWT, no personal data in the payload (docs/07 §2).
 * `secret` and `ttl` come from validated env config, never hardcoded.
 */
export function signAccessToken(payload: AccessTokenPayload, secret: string, ttl: string): string {
  return jwt.sign(payload, secret, { expiresIn: ttl as SignOptions['expiresIn'] });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  return jwt.verify(token, secret) as unknown as AccessTokenPayload;
}
