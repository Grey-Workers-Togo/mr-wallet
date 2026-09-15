import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors/app-error';
import { GoogleOAuthProvider } from '../google.provider';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe('GoogleOAuthProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds an authorize URL carrying the given state', () => {
    const provider = new GoogleOAuthProvider('client-id', 'secret', 'https://api.test/callback');
    const url = new URL(provider.buildAuthUrl('nonce-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('state')).toBe('nonce-123');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.test/callback');
  });

  it('maps a verified profile from the token + userinfo round trip', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at-1' }))
      .mockResolvedValueOnce(jsonResponse({ sub: 'google-sub-1', email: 'a@example.com', email_verified: true, name: 'A B' }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GoogleOAuthProvider('client-id', 'secret', 'https://api.test/callback');
    const profile = await provider.exchangeCode('code-1');

    expect(profile).toEqual({ providerAccountId: 'google-sub-1', email: 'a@example.com', emailVerified: true, name: 'A B' });
  });

  it('surfaces an unverified email as-is (the service decides what to do with it)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'at-1' }))
      .mockResolvedValueOnce(jsonResponse({ sub: 'google-sub-2', email: 'b@example.com', email_verified: false }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GoogleOAuthProvider('client-id', 'secret', 'https://api.test/callback');
    const profile = await provider.exchangeCode('code-2');

    expect(profile.emailVerified).toBe(false);
    expect(profile.email).toBe('b@example.com');
  });

  it('throws OAUTH_FAILED when the token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const provider = new GoogleOAuthProvider('client-id', 'secret', 'https://api.test/callback');

    const error = await provider.exchangeCode('bad-code').catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'OAUTH_FAILED' });
  });
});
