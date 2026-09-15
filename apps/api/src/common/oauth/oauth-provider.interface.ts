/** Normalized profile every provider adapter must produce, whatever its own response shape. */
export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OAuthProviderAdapter {
  /** Builds the provider's consent-screen URL; `state` is echoed back unmodified on callback. */
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthProfile>;
}
