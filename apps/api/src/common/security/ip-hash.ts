import { createHash } from 'node:crypto';

/** IP addresses are never logged or stored in clear (docs/07 §5). */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
