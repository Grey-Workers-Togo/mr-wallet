'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { clearLocalPin, hasLocalPin, verifyLocalPin } from '@/lib/local-pin';
import { purgeOfflineCache } from '@/lib/offline-cache';
import { setAccessToken } from '@/lib/auth-store';

const DEFAULT_LOCK_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'touchstart', 'scroll'] as const;

export function PinLockGate() {
  const t = useTranslations('preferences');
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockMinutesRef = useRef(DEFAULT_LOCK_MINUTES);

  const scheduleLock = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLocked(true), lockMinutesRef.current * 60 * 1000);
  }, []);

  useEffect(() => {
    hasLocalPin().then((has) => {
      setEnabled(has);
      if (has) scheduleLock();
    });
  }, [scheduleLock]);

  useEffect(() => {
    if (!enabled || locked) return;
    const reset = () => scheduleLock();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset));
    return () => ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
  }, [enabled, locked, scheduleLock]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const valid = await verifyLocalPin(pin);
    if (valid) {
      setLocked(false);
      setPin('');
      setAttempts(0);
      setError(null);
      scheduleLock();
      return;
    }

    const next = attempts + 1;
    setAttempts(next);
    setPin('');
    if (next >= MAX_ATTEMPTS) {
      await clearLocalPin();
      await purgeOfflineCache();
      setAccessToken(null);
      window.location.href = '/';
      return;
    }
    setError('wrongPin');
  }

  if (!enabled || !locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pinSection')}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0f172a',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        zIndex: 9999,
      }}
    >
      <form onSubmit={onSubmit}>
        <label>
          {t('pinLabel')}
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            pattern="\d{4,8}"
            minLength={4}
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
        </label>
        {error && <p role="alert">{t('pinLockedWrong')}</p>}
        <button type="submit">{t('pinUnlock')}</button>
      </form>
    </div>
  );
}
