/**
 * In-memory exponential backoff per (email, ipHash) — docs/07 §2: 5 failures then 1s/2s/4s… capped at 15 min.
 * Single-instance only; a multi-instance deployment needs a shared store (Redis) — noted as a follow-up.
 */
interface Attempt {
  count: number;
  blockedUntil: number;
}

const attempts = new Map<string, Attempt>();
const MAX_BACKOFF_MS = 15 * 60 * 1000;

function key(email: string, ipHash: string): string {
  return `${email}:${ipHash}`;
}

export function assertNotLocked(email: string, ipHash: string): void {
  const attempt = attempts.get(key(email, ipHash));
  if (attempt && attempt.blockedUntil > Date.now()) {
    throw new Error('LOGIN_LOCKED');
  }
}

export function recordFailure(email: string, ipHash: string): void {
  const k = key(email, ipHash);
  const attempt = attempts.get(k) ?? { count: 0, blockedUntil: 0 };
  attempt.count += 1;
  if (attempt.count >= 5) {
    const backoff = Math.min(2 ** (attempt.count - 5) * 1000, MAX_BACKOFF_MS);
    attempt.blockedUntil = Date.now() + backoff;
  }
  attempts.set(k, attempt);
}

export function recordSuccess(email: string, ipHash: string): void {
  attempts.delete(key(email, ipHash));
}
