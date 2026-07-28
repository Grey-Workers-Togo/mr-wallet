import * as argon2 from 'argon2';

/** PIN unlock hash uses light Argon2id params (docs/09 Lot 7): checked far more often than a password, on lower-power devices. */
const PIN_MEMORY_COST = 4096;

export function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, { type: argon2.argon2id, memoryCost: PIN_MEMORY_COST, timeCost: 2, parallelism: 1 });
}

export function verifyPin(hash: string, pin: string): Promise<boolean> {
  return argon2.verify(hash, pin);
}

export function isPinFormatValid(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}
