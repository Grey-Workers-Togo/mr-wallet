import { useTranslations } from 'next-intl';
import { API_BASE } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.92l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.26v3.1C3.25 21.3 7.31 24 12 24z"
      />
      <path fill="#FBBC05" d="M5.29 14.28A7.15 7.15 0 0 1 4.9 12c0-.79.14-1.56.39-2.28V6.62H1.26A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.26 5.38l4.03-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.26 6.62l4.03 3.1c.94-2.83 3.59-4.95 6.71-4.95z"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.9.57.1.78-.25.78-.55 0-.27-.01-1.13-.02-2.04-3.2.7-3.88-1.35-3.88-1.35-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.21.66.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

/** Full-navigation links (not `apiClient` fetches) — the browser must actually leave the page for the provider's consent screen. */
export function OAuthButtons() {
  const t = useTranslations('auth.oauth');

  return (
    <div className="space-y-3">
      <Button variant="outline" size="lg" className="h-11 w-full gap-2" render={<a href={`${API_BASE}/auth/google`} />}>
        <GoogleIcon />
        {t('continueWithGoogle')}
      </Button>
      <Button variant="outline" size="lg" className="h-11 w-full gap-2" render={<a href={`${API_BASE}/auth/github`} />}>
        <GithubIcon />
        {t('continueWithGithub')}
      </Button>
      <div className="relative py-2 text-center text-xs text-muted-foreground">
        <span className="relative z-10 bg-background px-2">{t('orDivider')}</span>
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      </div>
    </div>
  );
}
