/** Rendered server-side at send time, never stored (mirrors password-reset.ts). */
const CONTENT: Record<'fr' | 'en', { subject: string; body: (link: string) => string }> = {
  fr: {
    subject: 'Confirmez votre adresse e-mail Mr Wallet',
    body: (link) =>
      `Bienvenue sur Mr Wallet.\n\n` +
      `Cliquez sur ce lien pour confirmer votre adresse e-mail (valable 24 heures) :\n${link}\n\n` +
      `Si vous n'êtes pas à l'origine de cette inscription, ignorez cet e-mail.`,
  },
  en: {
    subject: 'Confirm your Mr Wallet email address',
    body: (link) =>
      `Welcome to Mr Wallet.\n\n` +
      `Click this link to confirm your email address (valid for 24 hours):\n${link}\n\n` +
      `If you didn't create this account, you can safely ignore this email.`,
  },
};

export function emailVerificationEmail(locale: string, verifyLink: string): { subject: string; text: string } {
  const lang = locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const { subject, body } = CONTENT[lang];
  return { subject, text: body(verifyLink) };
}
