import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors/app-error';
import { GithubOAuthProvider } from '../github.provider';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe('GithubOAuthProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an authorize URL carrying the given state', () => {
    const provider = new GithubOAuthProvider('client-id', 'secret', 'https://api.test/callback');
    const url = new URL(provider.buildAuthUrl('nonce-abc'));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('state')).toBe('nonce-abc');
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
  });

  it('picks the primary verified email even when it is not first in the list', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === 'https://github.com/login/oauth/access_token') return Promise.resolve(jsonResponse({ access_token: 'gh-at' }));
      if (url === 'https://api.github.com/user') return Promise.resolve(jsonResponse({ id: 42, name: 'Ada', login: 'ada' }));
      if (url === 'https://api.github.com/user/emails') {
        return Promise.resolve(
          jsonResponse([
            { email: 'secondary@example.com', primary: false, verified: true },
            { email: 'primary@example.com', primary: true, verified: true },
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GithubOAuthProvider('client-id', 'secret', 'https://api.test/callback');
    const profile = await provider.exchangeCode('code-1');

    expect(profile).toEqual({ providerAccountId: '42', email: 'primary@example.com', emailVerified: true, name: 'Ada' });
  });

  it('falls back to any verified email when none is marked primary', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === 'https://github.com/login/oauth/access_token') return Promise.resolve(jsonResponse({ access_token: 'gh-at' }));
      if (url === 'https://api.github.com/user') return Promise.resolve(jsonResponse({ id: 7, name: null, login: 'norma' }));
      if (url === 'https://api.github.com/user/emails') {
        return Promise.resolve(jsonResponse([{ email: 'only-verified@example.com', primary: false, verified: true }]));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GithubOAuthProvider('client-id', 'secret', 'https://api.test/callback');
    const profile = await provider.exchangeCode('code-2');

    expect(profile.email).toBe('only-verified@example.com');
    expect(profile.name).toBe('norma');
  });

  it('reports no usable email when the account has none verified', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === 'https://github.com/login/oauth/access_token') return Promise.resolve(jsonResponse({ access_token: 'gh-at' }));
      if (url === 'https://api.github.com/user') return Promise.resolve(jsonResponse({ id: 99, name: 'No Verified', login: 'nv' }));
      if (url === 'https://api.github.com/user/emails') {
        return Promise.resolve(jsonResponse([{ email: 'unverified@example.com', primary: true, verified: false }]));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GithubOAuthProvider('client-id', 'secret', 'https://api.test/callback');
    const profile = await provider.exchangeCode('code-3');

    expect(profile.email).toBeNull();
    expect(profile.emailVerified).toBe(false);
  });

  it('throws OAUTH_FAILED when the token exchange response has no access_token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'bad_verification_code' })));
    const provider = new GithubOAuthProvider('client-id', 'secret', 'https://api.test/callback');

    const error = await provider.exchangeCode('bad-code').catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'OAUTH_FAILED' });
  });
});
