import { NotificationType } from '@prisma/client';

/**
 * Push notifications render server-side and never contain an amount or a transaction
 * label (CLAUDE.md "Sécurité" / docs/09 Lot 7) — a locked screen and a third-party push
 * service are not a safe surface for that data. Only the generic (type, locale) pair is used.
 */
const TITLES: Record<'fr' | 'en', Record<NotificationType, string>> = {
  fr: {
    BUDGET_THRESHOLD: 'Budget bientôt atteint',
    BUDGET_EXCEEDED: 'Budget dépassé',
    DEBT_DUE_SOON: 'Échéance de dette proche',
    DEBT_OVERDUE: 'Échéance de dette en retard',
    DEBT_PAID_OFF: 'Dette soldée',
    GOAL_REACHED: 'Objectif atteint',
    RECURRENCE_DUE: 'Récurrence à venir',
    IMPORT_COMPLETED: 'Import terminé',
    IMPORT_FAILED: "Échec de l'import",
    BALANCE_MISMATCH: 'Écart de solde détecté',
  },
  en: {
    BUDGET_THRESHOLD: 'Budget threshold reached',
    BUDGET_EXCEEDED: 'Budget exceeded',
    DEBT_DUE_SOON: 'Debt installment due soon',
    DEBT_OVERDUE: 'Debt installment overdue',
    DEBT_PAID_OFF: 'Debt paid off',
    GOAL_REACHED: 'Goal reached',
    RECURRENCE_DUE: 'Upcoming recurring transaction',
    IMPORT_COMPLETED: 'Import completed',
    IMPORT_FAILED: 'Import failed',
    BALANCE_MISMATCH: 'Balance mismatch detected',
  },
};

export function pushContentFor(type: NotificationType, locale: string): { title: string; body: string } {
  const lang = locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const title = TITLES[lang][type];
  const body = lang === 'fr' ? 'Ouvrez l’application pour plus de détails.' : 'Open the app for details.';
  return { title, body };
}
