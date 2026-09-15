import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { UsersFacade } from '../../users/users.facade';
import { CategoriesFacade } from '../../categories/categories.facade';
import { CategoriesService } from '../../categories/categories.service';
import { AuthService } from '../auth.service';

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

describe('auth OAuth account list / unlink', () => {
  const prisma = new PrismaService();
  const users = new UsersFacade(prisma);
  const categories = new CategoriesFacade(new CategoriesService(prisma));
  const config = fakeConfig();
  const service = new AuthService(prisma, users, categories, config, new FakeMailService() as unknown as MailService);

  const userIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.category.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('blocks unlinking the only remaining authentication method for a social-only account', async () => {
    const user = await users.createUser({
      email: `oauth-unlink-solo-${Date.now()}@example.com`,
      passwordHash: null,
      baseCurrency: 'EUR',
    });
    userIds.push(user.id);
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: 'GOOGLE', providerAccountId: `solo-${user.id}`, email: user.email },
    });

    await expect(service.unlinkOAuthAccount(user.id, 'GOOGLE')).rejects.toMatchObject({ code: 'OAUTH_LAST_AUTH_METHOD' });
    expect(await prisma.oAuthAccount.findFirst({ where: { userId: user.id } })).not.toBeNull();
  });

  it('allows unlinking the only OAuth account when the user also has a password', async () => {
    const user = await users.createUser({
      email: `oauth-unlink-haspw-${Date.now()}@example.com`,
      passwordHash: 'irrelevant-hash-for-this-test',
      baseCurrency: 'EUR',
    });
    userIds.push(user.id);
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: 'GITHUB', providerAccountId: `haspw-${user.id}`, email: user.email },
    });

    await service.unlinkOAuthAccount(user.id, 'GITHUB');
    expect(await prisma.oAuthAccount.findFirst({ where: { userId: user.id } })).toBeNull();
  });

  it('allows unlinking one of several linked providers, leaving the other', async () => {
    const user = await users.createUser({
      email: `oauth-unlink-multi-${Date.now()}@example.com`,
      passwordHash: null,
      baseCurrency: 'EUR',
    });
    userIds.push(user.id);
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: 'GOOGLE', providerAccountId: `multi-google-${user.id}`, email: user.email },
    });
    await prisma.oAuthAccount.create({
      data: { userId: user.id, provider: 'GITHUB', providerAccountId: `multi-github-${user.id}`, email: user.email },
    });

    await service.unlinkOAuthAccount(user.id, 'GOOGLE');

    const remaining = await service.listOAuthAccounts(user.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.provider).toBe('GITHUB');
  });

  it('cross-user isolation: user B cannot list or unlink user A\'s linked account', async () => {
    const userA = await users.createUser({
      email: `oauth-unlink-a-${Date.now()}@example.com`,
      passwordHash: null,
      baseCurrency: 'EUR',
    });
    const userB = await users.createUser({
      email: `oauth-unlink-b-${Date.now()}@example.com`,
      passwordHash: null,
      baseCurrency: 'EUR',
    });
    userIds.push(userA.id, userB.id);
    await prisma.oAuthAccount.create({
      data: { userId: userA.id, provider: 'GOOGLE', providerAccountId: `iso-${userA.id}`, email: userA.email },
    });

    expect(await service.listOAuthAccounts(userB.id)).toHaveLength(0);
    await expect(service.unlinkOAuthAccount(userB.id, 'GOOGLE')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.oAuthAccount.findFirst({ where: { userId: userA.id } })).not.toBeNull();
  });
});
