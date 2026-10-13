import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../config/env.schema';
import { fixedClock, parseFixedInstant } from '../clock';

const BASE_ENV = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 's', IP_HASH_SALT: 's' };

describe('fixed clock', () => {
  it('always answers the instant it was given', () => {
    const clock = fixedClock(new Date('2026-09-30T12:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-09-30T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-09-30T12:00:00.000Z');
  });

  it('hands out a copy: a caller that mutates its date does not move the clock', () => {
    const clock = fixedClock(new Date('2026-09-30T12:00:00Z'));
    clock.now().setUTCMonth(11);
    expect(clock.now().toISOString()).toBe('2026-09-30T12:00:00.000Z');
  });
});

describe('CLOCK_FIXED_AT', () => {
  it('accepts an instant with a zone', () => {
    expect(parseFixedInstant('2026-09-30T12:00:00Z')?.toISOString()).toBe('2026-09-30T12:00:00.000Z');
    expect(parseFixedInstant('2026-09-30T12:00:00+01:00')?.toISOString()).toBe('2026-09-30T11:00:00.000Z');
  });

  it('refuses what would silently mean a time of day in some zone', () => {
    expect(parseFixedInstant('2026-09-30')).toBeNull();
    expect(parseFixedInstant('2026-09-30T12:00:00')).toBeNull();
    expect(parseFixedInstant('yesterday')).toBeNull();
    expect(parseFixedInstant('2026-13-45T12:00:00Z')).toBeNull();
  });

  it('is accepted in development and in test', () => {
    for (const NODE_ENV of ['development', 'test']) {
      expect(validateEnv({ ...BASE_ENV, NODE_ENV, CLOCK_FIXED_AT: '2026-09-30T12:00:00Z' }).CLOCK_FIXED_AT).toBe(
        '2026-09-30T12:00:00Z',
      );
    }
  });

  it('refuses to boot in production, like the fake adapter does', () => {
    const production = {
      ...BASE_ENV,
      NODE_ENV: 'production',
      VAPID_PUBLIC_KEY: 'k',
      VAPID_PRIVATE_KEY: 'k',
      VAPID_SUBJECT: 'mailto:ops@example.com',
      CORS_ORIGIN: 'https://example.com',
      SMTP_HOST: 'smtp.example.com',
    };
    expect(validateEnv(production).CLOCK_FIXED_AT).toBe('');
    expect(() => validateEnv({ ...production, CLOCK_FIXED_AT: '2026-09-30T12:00:00Z' })).toThrow(/CLOCK_FIXED_AT/);
  });

  it('refuses a value that is not an instant, whatever the environment', () => {
    expect(() => validateEnv({ ...BASE_ENV, NODE_ENV: 'development', CLOCK_FIXED_AT: '2026-09-30' })).toThrow(
      /CLOCK_FIXED_AT must be an ISO 8601 instant/,
    );
  });
});
