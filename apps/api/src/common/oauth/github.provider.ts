import { HttpStatus } from '@nestjs/common';
import { AppError } from '../errors/app-error';
import { OAuthProfile, OAuthProviderAdapter } from './oauth-provider.interface';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const USER_EMAILS_URL = 'https://api.github.com/user/emails';

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
}

interface GithubUserResponse {
  id: number;
  name?: string | null;
  login: string;
}

interface GithubEmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * GitHub's `/user` response doesn't reliably include a verified email (it can be private), so a
 * second call to `/user/emails` (requires the `user:email` scope) is necessary to find one.
 */
export class GithubOAuthProvider implements OAuthProviderAdapter {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'read:user user:email',
      state,
      allow_signup: 'true',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthProfile> {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      throw new AppError('OAUTH_FAILED', HttpStatus.BAD_GATEWAY);
    }
    const token = (await tokenResponse.json()) as GithubTokenResponse;
    if (!token.access_token) {
      throw new AppError('OAUTH_FAILED', HttpStatus.BAD_GATEWAY);
    }

    const authHeaders = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json' };
    const [userResponse, emailsResponse] = await Promise.all([
      fetch(USER_URL, { headers: authHeaders }),
      fetch(USER_EMAILS_URL, { headers: authHeaders }),
    ]);
    if (!userResponse.ok || !emailsResponse.ok) {
      throw new AppError('OAUTH_FAILED', HttpStatus.BAD_GATEWAY);
    }
    const user = (await userResponse.json()) as GithubUserResponse;
    const emails = (await emailsResponse.json()) as GithubEmailEntry[];
    const verifiedPrimary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified) ?? null;

    return {
      providerAccountId: String(user.id),
      email: verifiedPrimary?.email ?? null,
      emailVerified: verifiedPrimary !== null,
      name: user.name ?? user.login ?? null,
    };
  }
}
