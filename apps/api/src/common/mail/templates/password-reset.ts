/**
 * Rendered server-side at send time, never stored (CLAUDE.md "Langues" exception for
 * transactional content, mirrors push-content.ts for notifications).
 */
const CONTENT: Record<'fr' | 'en', { subject: string; body: (link: string) => string }> = {
  fr: {
    subject: 'Réinitialisez votre mot de passe Mr Wallet',
    body: (link) =>
      `Vous avez demandé la réinitialisation de votre mot de passe.\n\n` +
      `Cliquez sur ce lien pour choisir un nouveau mot de passe (valable 30 minutes) :\n${link}\n\n` +
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
  },
  en: {
    subject: 'Reset your Mr Wallet password',
    body: (link) =>
      `You requested a password reset.\n\n` +
      `Click this link to choose a new password (valid for 30 minutes):\n${link}\n\n` +
      `If you didn't request this, you can safely ignore this email.`,
  },
};

export function passwordResetEmail(locale: string, resetLink: string): { subject: string; text: string } {
  const lang = locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const { subject, body } = CONTENT[lang];
  return { subject, text: body(resetLink) };
}
