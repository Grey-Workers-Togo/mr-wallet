import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { UsersFacade } from '../../users/users.facade';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { AuthService } from '../auth.service';
import { OAuthProfile, OAuthProviderAdapter } from '../../../common/oauth/oauth-provider.interface';

function fakeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string | undefined> = { ...process.env, ...overrides };
  const coerce = (raw: string | undefined) => (raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : raw);
  return {
    get: (key: string) => coerce(values[key]),
    getOrThrow: (key: string) => {
      const value = coerce(values[key]);
      if (value === undefined) throw new Error(`fakeConfig: missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

class FakeMailService {
  async send(): Promise<void> {}
}

/** Swaps in a canned profile (or a thrown error) instead of a real network round-trip to Google/GitHub. */
class FakeOAuthProviderAdapter implements OAuthProviderAdapter {
  constructor(private readonly profile: OAuthProfile) {}
  buildAuthUrl(): string {
    return 'https://example.test/authorize';
  }
  async exchangeCode(): Promise<OAuthProfile> {
    return this.profile;
  }
}

/** Casts around the private method rather than reorganizing AuthService just for testability. */
function withFakeProfile(service: AuthService, profile: OAuthProfile): void {
  (service as unknown as { getOAuthProviderAdapter: () => OAuthProviderAdapter }).getOAuthProviderAdapter = () =>
    new FakeOAuthProviderAdapter(profile);
}

describe('auth OAuth login / auto-link resolution', () => {
  const prisma = new PrismaService();
  const users = new UsersFacade(prisma);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const config = fakeConfig();
  const service = new AuthService(prisma, users, categories, config, new FakeMailService() as unknown as MailService);

  const runId = Date.now();
  const pid = (suffix: string) => `test-${runId}-${suffix}`;
  const linkedEmail = `oauth-linked-${runId}@example.com`;
  const autoLinkEmail = `oauth-autolink-${runId}@example.com`;
  const userIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('logs in through an already-linked OAuthAccount, whatever the provider reports about the email today', async () => {
    const user = await users.createUser({ email: linkedEmail, passwordHash: null, baseCurrency: 'EUR' });
    userIds.push(user.id);
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: 'GOOGLE', providerAccountId: pid('linked-1'), email: linkedEmail },
    });

    withFakeProfile(service, {
      providerAccountId: pid('linked-1'),
      email: 'a-different-address@example.com',
      emailVerified: false,
      name: 'Someone',
    });

    const outcome = await service.handleOAuthCallback('GOOGLE', 'code', 'test-ip', 'vitest');
    expect(outcome.kind).toBe('login');
    if (outcome.kind === 'login') {
      expect(outcome.user.id).toBe(user.id);
      expect(outcome.accessToken).toBeTruthy();
    }
  });

  it('auto-links a verified-email match onto an existing account and logs in', async () => {
    const user = await users.createUser({ email: autoLinkEmail, passwordHash: null, baseCurrency: 'EUR' });
    userIds.push(user.id);

    withFakeProfile(service, {
      providerAccountId: pid('autolink-1'),
      email: autoLinkEmail,
      emailVerified: true,
      name: 'Auto Link',
    });

    const outcome = await service.handleOAuthCallback('GOOGLE', 'code', 'test-ip', 'vitest');
    expect(outcome.kind).toBe('login');
    if (outcome.kind === 'login') {
      expect(outcome.user.id).toBe(user.id);
    }

    const link = await prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: pid('autolink-1') } },
    });
    expect(link?.userId).toBe(user.id);
  });

  it('refuses to auto-link when the provider reports the matching email as unverified', async () => {
    withFakeProfile(service, {
      providerAccountId: pid('autolink-2'),
      email: autoLinkEmail,
      emailVerified: false,
      name: 'Auto Link',
    });

    const before = await prisma.oAuthAccount.count({ where: { userId: { in: userIds } } });
    const outcome = await service.handleOAuthCallback('GOOGLE', 'code', 'test-ip', 'vitest');
    expect(outcome).toMatchObject({ kind: 'error', code: 'OAUTH_EMAIL_UNVERIFIED_CONFLICT' });

    const after = await prisma.oAuthAccount.count({ where: { userId: { in: userIds } } });
    expect(after).toBe(before);
  });

  it('rejects a provider identity with no usable verified email at all', async () => {
    withFakeProfile(service, {
      providerAccountId: pid('no-email-1'),
      email: null,
      emailVerified: false,
      name: 'No Email',
    });

    const outcome = await service.handleOAuthCallback('GITHUB', 'code', 'test-ip', 'vitest');
    expect(outcome).toMatchObject({ kind: 'error', code: 'OAUTH_EMAIL_UNAVAILABLE' });
  });
});
