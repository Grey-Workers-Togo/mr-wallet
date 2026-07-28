/**
 * Access token lives in memory only, never localStorage (docs/07-securite-audit.md RG-S2).
 * Lost on reload by design — the refresh cookie (HttpOnly) re-establishes it on next load.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
