import { HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';
import { OAuthProfile, OAuthProviderAdapter } from './oauth-provider.interface';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserinfoResponse {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/** No SDK dependency — plain `fetch` against Google's OAuth2/OIDC REST endpoints. */
export class GoogleOAuthProvider implements OAuthProviderAdapter {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthProfile> {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) {
      throw new AppError('OAUTH_FAILED', HttpStatus.BAD_GATEWAY);
    }
    const token = (await tokenResponse.json()) as GoogleTokenResponse;

    const userinfoResponse = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!userinfoResponse.ok) {
      throw new AppError('OAUTH_FAILED', HttpStatus.BAD_GATEWAY);
    }
    const profile = (await userinfoResponse.json()) as GoogleUserinfoResponse;

    return {
      providerAccountId: profile.sub,
      email: profile.email ?? null,
      emailVerified: profile.email_verified === true,
      name: profile.name ?? null,
    };
  }
}
