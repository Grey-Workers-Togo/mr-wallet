'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Joyride, STATUS, EVENTS, type Step, type EventData } from 'react-joyride';
import { useMe } from '@/hooks/useMe';
import { apiClient } from '@/lib/api-client';

const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * First-login guided tour, desktop-only: the sidebar nav it targets doesn't exist in the
 * mobile layout (bottom tab bar instead), so on narrow viewports users rely on the
 * per-page empty-state guidance instead of this tour.
 */
export function ProductTour() {
  const t = useTranslations('onboarding');
  const me = useMe();
  const [isDesktop, setIsDesktop] = useState(false);
  const [run, setRun] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mql.matches);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isDesktop || !me || me.hasSeenOnboarding || completed) return;
    const timer = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(timer);
  }, [isDesktop, me, completed]);

  const steps: Step[] = useMemo(
    () => [
      { target: 'body', placement: 'center', title: t('welcomeTitle'), content: t('welcomeContent') },
      { target: '[data-tour="nav-accounts"]', title: t('accountsTitle'), content: t('accountsContent') },
      { target: '[data-tour="nav-transactions"]', title: t('transactionsTitle'), content: t('transactionsContent') },
      { target: '[data-tour="nav-budgets"]', title: t('budgetsTitle'), content: t('budgetsContent') },
      { target: '[data-tour="nav-debts"]', title: t('debtsTitle'), content: t('debtsContent') },
      { target: '[data-tour="nav-goals"]', title: t('goalsTitle'), content: t('goalsContent') },
      { target: 'body', placement: 'center', title: t('finishTitle'), content: t('finishContent') },
    ],
    [t],
  );

  function markSeen() {
    setCompleted(true);
    setRun(false);
    apiClient.patch('/me', { hasSeenOnboarding: true }).catch(() => {
      // best-effort: worst case the tour offers itself again next login
    });
  }

  function onEvent(data: EventData) {
    if (data.type === EVENTS.TOUR_STATUS && (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED)) {
      markSeen();
    }
  }

  if (!isDesktop || !me || me.hasSeenOnboarding || completed) return null;

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      scrollToFirstStep
      onEvent={onEvent}
      options={{ buttons: ['back', 'skip', 'primary'], primaryColor: 'var(--color-primary)', zIndex: 100 }}
      locale={{ back: t('back'), close: t('close'), last: t('finish'), next: t('next'), skip: t('skip') }}
    />
  );
}
