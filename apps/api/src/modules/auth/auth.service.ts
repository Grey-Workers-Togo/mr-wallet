import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Session, OAuthProvider as OAuthProviderName } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError, ConflictAppError, ValidationAppError } from '../../common/errors/app-error';
import { MailService } from '../../common/mail/mail.service';
import { passwordResetEmail } from '../../common/mail/templates/password-reset';
import { emailVerificationEmail } from '../../common/mail/templates/email-verify';
import { UsersFacade } from '../users/users.facade';
import { CategoriesFacade } from '../categories/categories.facade';
import { hashPassword, isPasswordAcceptable, verifyPassword } from './domain/password';
import { generateRefreshToken, hashRefreshToken, refreshTokenMatches } from './domain/refresh-token';
import { signAccessToken } from '../../common/auth/jwt.util';
import { assertNotLocked, recordFailure, recordSuccess } from './login-throttle';
import { OAuthProfile, OAuthProviderAdapter } from '../../common/oauth/oauth-provider.interface';
import { GoogleOAuthProvider } from '../../common/oauth/google.provider';
import { GithubOAuthProvider } from '../../common/oauth/github.provider';
import {
  ChangePasswordDto,
  LoginDto,
  OAuthCompleteDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
  /** True when the refresh cookie must NOT be overwritten (see `refresh()` grace-window path). */
  skipCookie?: boolean;
}

export type OAuthCallbackOutcome =
  | { kind: 'login'; loginTicket: string; refreshToken: string; user: { id: string; email: string } }
  | { kind: 'pending'; redirectToken: string }
  | { kind: 'error'; code: string };

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A brand-new OAuth identity has this long to pick a base currency and complete signup. */
const PENDING_OAUTH_SIGNUP_TTL_MS = 10 * 60 * 1000;
/**
 * A returning OAuth login's handshake ticket, consumed within seconds by the front end's
 * auto-redirect landing page - short-lived since, unlike the signup flow, no user input is
 * involved.
 */
const OAUTH_LOGIN_TICKET_TTL_MS = 5 * 60 * 1000;
/**
 * Refresh tokens rotate on every use. Two tabs/requests racing on the same expired
 * access token can both present the same (about-to-be-superseded) refresh token; without
 * this grace window the second one looks like theft and revokes every session (docs bug:
 * "Authentification requise" appearing app-wide after brief inactivity). Within this window
 * a superseded token still resolves to its successor session instead of nuking the family.
 */
const REFRESH_REUSE_GRACE_MS = 10_000;

/**
 * A `{ superseded }` outcome is resolved through the grace/reuse path outside the transaction,
 * whose family-wide revocation must survive the terminal error it raises.
 */
type RefreshTxOutcome = AuthResult | { superseded: Session };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersFacade,
    private readonly categories: CategoriesFacade,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  private issueTokens(userId: string, sessionId: string): { accessToken: string; refreshToken: string } {
    const accessToken = signAccessToken(
      { sub: userId, sessionId },
      this.config.getOrThrow('JWT_SECRET'),
      this.config.get('JWT_ACCESS_TTL') ?? '15m',
    );
    const refreshToken = generateRefreshToken();
    return { accessToken, refreshToken };
  }

  /** Registration never issues a session — the account is unusable until the email is verified (see `login`). */
  async register(dto: RegisterDto): Promise<{ email: string }> {
    if (!isPasswordAcceptable(dto.password)) {
      throw new ValidationAppError('PASSWORD_TOO_WEAK');
    }
    const currency = await this.prisma.currency.findUnique({ where: { code: dto.baseCurrency } });
    if (!currency) {
      throw new ValidationAppError('CURRENCY_UNKNOWN', { code: dto.baseCurrency });
    }
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictAppError('EMAIL_ALREADY_REGISTERED');
    }

    const passwordHash = await hashPassword(dto.password, this.config.get('ARGON_MEMORY_COST') ?? 19456);
    const user = await this.users.createUser({
      email: dto.email,
      passwordHash,
      baseCurrency: dto.baseCurrency,
      timezone: dto.timezone,
    });
    await this.categories.seedSystemDefaults(user.id);
    await this.sendVerificationEmail(user.id, user.email, user.locale);

    return { email: user.email };
  }

  async login(dto: LoginDto, ipHash: string, userAgent: string | null): Promise<AuthResult> {
    try {
      assertNotLocked(dto.email, ipHash);
    } catch {
      throw new AppError('LOGIN_LOCKED', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.users.findByEmail(dto.email);
    const passwordValid = user?.passwordHash ? await verifyPassword(user.passwordHash, dto.password) : false;

    if (!user || !passwordValid) {
      recordFailure(dto.email, ipHash);
      throw new AppError('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }

    if (!user.emailVerifiedAt) {
      throw new AppError('EMAIL_NOT_VERIFIED', HttpStatus.FORBIDDEN);
    }

    recordSuccess(dto.email, ipHash);
    await this.users.markLastLogin(user.id);
    return this.createSessionAndTokens(user.id, user.email, ipHash, userAgent);
  }

  private async sendVerificationEmail(userId: string, email: string, locale: string): Promise<void> {
    const token = generateRefreshToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(token),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    const verifyLink = `${this.config.getOrThrow('WEB_APP_URL')}/verify-email?token=${token}`;
    const { subject, text } = emailVerificationEmail(locale, verifyLink);
    await this.mail.send({ to: email, subject, text });
  }

  /** Verifying proves email ownership, so it doubles as first login (issues a session). */
  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResult> {
    const hash = hashRefreshToken(dto.token);
    const verificationToken = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    if (!verificationToken || verificationToken.usedAt || verificationToken.expiresAt < new Date()) {
      throw new AppError('INVALID_VERIFICATION_TOKEN', HttpStatus.BAD_REQUEST);
    }

    const user = await this.users.markEmailVerified(verificationToken.userId);
    await this.prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    });

    return this.createSessionAndTokens(user.id, user.email, null, null);
  }

  /** Always resolves, whether or not the account exists or is already verified — no account enumeration. */
  async resendVerification(dto: ResendVerificationDto): Promise<void> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user.id, user.email, user.locale);
  }

  /** Throws `OAUTH_PROVIDER_DISABLED` if that provider has no client id/secret configured. */
  private getOAuthProviderAdapter(provider: OAuthProviderName): OAuthProviderAdapter {
    const base = this.config.get('API_PUBLIC_URL') ?? '';
    if (provider === 'GOOGLE') {
      const clientId = this.config.get('GOOGLE_CLIENT_ID') ?? '';
      const clientSecret = this.config.get('GOOGLE_CLIENT_SECRET') ?? '';
      if (!clientId || !clientSecret || !base) {
        throw new AppError('OAUTH_PROVIDER_DISABLED', HttpStatus.NOT_FOUND);
      }
      return new GoogleOAuthProvider(clientId, clientSecret, `${base}/api/v1/auth/google/callback`);
    }
    const clientId = this.config.get('GITHUB_CLIENT_ID') ?? '';
    const clientSecret = this.config.get('GITHUB_CLIENT_SECRET') ?? '';
    if (!clientId || !clientSecret || !base) {
      throw new AppError('OAUTH_PROVIDER_DISABLED', HttpStatus.NOT_FOUND);
    }
    return new GithubOAuthProvider(clientId, clientSecret, `${base}/api/v1/auth/github/callback`);
  }

  buildOAuthAuthorizeUrl(provider: OAuthProviderName, state: string): string {
    return this.getOAuthProviderAdapter(provider).buildAuthUrl(state);
  }

  /**
   * Order of resolution (docs/07 §2 "OAuth2 / social login"):
   * 1. Already-linked `OAuthAccount` → log in, whatever the provider says about the email today.
   * 2. No link, but the provider gave a verified email matching an existing `User` → auto-link.
   * 3. No link, provider gave a verified email matching an existing `User`, but reported
   *    unverified → refuse (`OAUTH_EMAIL_UNVERIFIED_CONFLICT`) rather than silently take over
   *    that account.
   * 4. No link, no matching `User`, no usable verified email at all → `OAUTH_EMAIL_UNAVAILABLE`.
   * 5. Otherwise: brand-new identity → a `PendingOAuthSignup` row, caller redirects to the
   *    "pick a base currency" step (`completeOAuthSignup`) — see class-level note on why a User
   *    row can't be created yet.
   */
  async handleOAuthCallback(
    provider: OAuthProviderName,
    code: string,
    ipHash: string,
    userAgent: string | null,
  ): Promise<OAuthCallbackOutcome> {
    let profile: OAuthProfile;
    try {
      profile = await this.getOAuthProviderAdapter(provider).exchangeCode(code);
    } catch (error) {
      return { kind: 'error', code: error instanceof AppError ? error.code : 'OAUTH_FAILED' };
    }

    // `findUnique` on the (provider, providerAccountId) unique index is the only way to look
    // this up, but the soft-delete extension deliberately can't filter a unique-key lookup
    // (see soft-delete.extension.ts) — a previously-unlinked row must be checked explicitly, or
    // a user who unlinked a provider would find themselves silently still logged in through it.
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
    });
    if (existingLink && !existingLink.deletedAt) {
      const user = await this.users.findById(existingLink.userId);
      if (!user) {
        return { kind: 'error', code: 'OAUTH_FAILED' };
      }
      return this.loginViaOAuth(user.id, user.email, ipHash, userAgent);
    }

    const existingUser = profile.email ? await this.users.findByEmail(profile.email) : null;
    if (existingUser) {
      if (!profile.emailVerified) {
        return { kind: 'error', code: 'OAUTH_EMAIL_UNVERIFIED_CONFLICT' };
      }
      // `upsert`, not `create`: a soft-deleted row from a previous unlink still occupies this
      // unique key at the DB level, so re-linking the same provider account must revive it
      // rather than crash on a unique-constraint violation.
      await this.prisma.oAuthAccount.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
        create: { userId: existingUser.id, provider, providerAccountId: profile.providerAccountId, email: profile.email as string },
        update: { userId: existingUser.id, email: profile.email as string, deletedAt: null },
      });
      return this.loginViaOAuth(existingUser.id, existingUser.email, ipHash, userAgent);
    }

    if (!profile.email || !profile.emailVerified) {
      return { kind: 'error', code: 'OAUTH_EMAIL_UNAVAILABLE' };
    }

    const redirectToken = generateRefreshToken();
    await this.prisma.pendingOAuthSignup.create({
      data: {
        tokenHash: hashRefreshToken(redirectToken),
        provider,
        providerAccountId: profile.providerAccountId,
        email: profile.email,
        name: profile.name,
        expiresAt: new Date(Date.now() + PENDING_OAUTH_SIGNUP_TTL_MS),
      },
    });
    return { kind: 'pending', redirectToken };
  }

  /** Finishes a brand-new OAuth signup once the client picks a `baseCurrency` (mirrors `register()`). */
  async completeOAuthSignup(dto: OAuthCompleteDto, ipHash: string, userAgent: string | null): Promise<AuthResult> {
    const hash = hashRefreshToken(dto.token);
    const pending = await this.prisma.pendingOAuthSignup.findUnique({ where: { tokenHash: hash } });
    if (!pending || pending.usedAt || pending.expiresAt < new Date()) {
      throw new AppError('INVALID_OAUTH_SIGNUP_TOKEN', HttpStatus.BAD_REQUEST);
    }

    const currency = await this.prisma.currency.findUnique({ where: { code: dto.baseCurrency } });
    if (!currency) {
      throw new ValidationAppError('CURRENCY_UNKNOWN', { code: dto.baseCurrency });
    }

    // The email might have been claimed by another signup in the meantime — re-check right
    // before creating the row (mirrors the same check in `register()`).
    const existing = await this.users.findByEmail(pending.email);
    if (existing) {
      throw new ConflictAppError('EMAIL_ALREADY_REGISTERED');
    }

    const user = await this.users.createUser({
      email: pending.email,
      passwordHash: null,
      baseCurrency: dto.baseCurrency,
      displayName: pending.name ?? undefined,
      // The provider already vouched for this address — no separate verification email needed.
      emailVerifiedAt: new Date(),
    });
    await Promise.all([
      // `upsert`, same reasoning as in `handleOAuthCallback`: a soft-deleted row from a previous
      // unlink still occupies this unique key at the DB level.
      this.prisma.oAuthAccount.upsert({
        where: { provider_providerAccountId: { provider: pending.provider, providerAccountId: pending.providerAccountId } },
        update: { userId: user.id, email: pending.email, deletedAt: null },
        create: {
          userId: user.id,
          provider: pending.provider,
          providerAccountId: pending.providerAccountId,
          email: pending.email,
        },
      }),
      this.prisma.pendingOAuthSignup.update({ where: { id: pending.id }, data: { usedAt: new Date() } }),
      this.categories.seedSystemDefaults(user.id),
    ]);

    return this.createSessionAndTokens(user.id, user.email, ipHash, userAgent);
  }

  listOAuthAccounts(userId: string) {
    return this.prisma.oAuthAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, provider: true, email: true, createdAt: true },
    });
  }

  /** Never leaves an account with zero ways to log in (`OAUTH_LAST_AUTH_METHOD`). */
  async unlinkOAuthAccount(userId: string, provider: OAuthProviderName): Promise<void> {
    const account = await this.prisma.oAuthAccount.findFirst({ where: { userId, provider } });
    if (!account) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const user = await this.users.findById(userId);
    if (!user?.passwordHash) {
      const linkedCount = await this.prisma.oAuthAccount.count({ where: { userId } });
      if (linkedCount <= 1) {
        throw new AppError('OAUTH_LAST_AUTH_METHOD', HttpStatus.CONFLICT);
      }
    }
    await this.prisma.oAuthAccount.delete({ where: { id: account.id } });
  }

  private async createSessionAndTokens(
    userId: string,
    email: string,
    ipHash: string | null,
    userAgent: string | null,
  ): Promise<AuthResult & { sessionId: string }> {
    const sessionId = randomUUID();
    const { accessToken, refreshToken } = this.issueTokens(userId, sessionId);
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ipHash,
        userAgent,
      },
    });
    return { accessToken, refreshToken, sessionId, user: { id: userId, email } };
  }

  /**
   * A returning OAuth login lands via a plain redirect, so the access token can't travel with it,
   * and the refresh cookie set on that same redirect is a cross-site cookie the browser may
   * simply refuse to store (Safari ITP, Firefox ETP strict) - the dashboard would then find
   * itself permanently unauthorized on first load. The session/refresh-token pair is still
   * created and the refresh cookie still set (best-effort, for browsers that do allow it on later
   * reloads), but the caller gets back an opaque single-use ticket instead of the tokens
   * themselves - the front end exchanges it via POST (`exchangeOAuthLoginTicket`) for a real
   * access token with no cookie involved at all.
   */
  private async loginViaOAuth(
    userId: string,
    email: string,
    ipHash: string | null,
    userAgent: string | null,
  ): Promise<OAuthCallbackOutcome> {
    const { refreshToken, sessionId, user } = await this.createSessionAndTokens(userId, email, ipHash, userAgent);
    const loginTicket = generateRefreshToken();
    await this.prisma.oAuthLoginTicket.create({
      data: {
        tokenHash: hashRefreshToken(loginTicket),
        userId,
        sessionId,
        expiresAt: new Date(Date.now() + OAUTH_LOGIN_TICKET_TTL_MS),
      },
    });
    return { kind: 'login', loginTicket, refreshToken, user };
  }

  /** Exchanges a `loginViaOAuth` ticket for a real access token - see that method's comment. */
  async exchangeOAuthLoginTicket(ticket: string): Promise<{ accessToken: string; user: { id: string; email: string } }> {
    const hash = hashRefreshToken(ticket);
    const record = await this.prisma.oAuthLoginTicket.findUnique({ where: { tokenHash: hash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new AppError('INVALID_OAUTH_LOGIN_TICKET', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.oAuthLoginTicket.update({ where: { id: record.id }, data: { usedAt: new Date() } });

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new AppError('OAUTH_FAILED', HttpStatus.UNAUTHORIZED);
    }
    const accessToken = signAccessToken(
      { sub: user.id, sessionId: record.sessionId },
      this.config.getOrThrow('JWT_SECRET'),
      this.config.get('JWT_ACCESS_TTL') ?? '15m',
    );
    return { accessToken, user: { id: user.id, email: user.email } };
  }

  /**
   * Rotation: the presented refresh token is immediately superseded, a new one issued (docs/07 §2).
   * Lookup and rotation run in one interactive transaction so two concurrent requests carrying
   * the same token cannot both rotate it; a loser falls through to the grace/reuse path.
   */
  async refresh(presentedToken: string, ipHash: string, userAgent: string | null): Promise<AuthResult> {
    const hash = hashRefreshToken(presentedToken);

    const outcome = await this.prisma.$transaction<RefreshTxOutcome>(async (tx) => {
      const session = await tx.session.findFirst({ where: { refreshTokenHash: hash } });

      if (!session) {
        throw new AppError('INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
      }

      if (session.supersededAt) {
        // Resolved outside: the reuse path revokes the family, which must survive its throw.
        return { superseded: session };
      }

      if (session.revokedAt) {
        throw new AppError('INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
      }
      if (session.expiresAt < new Date()) {
        throw new AppError('REFRESH_TOKEN_EXPIRED', HttpStatus.UNAUTHORIZED);
      }
      if (!refreshTokenMatches(presentedToken, session.refreshTokenHash)) {
        throw new AppError('INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
      }

      const user = await this.users.findById(session.userId);
      if (!user) {
        throw new AppError('INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
      }

      const newSessionId = randomUUID();
      const { accessToken, refreshToken } = this.issueTokens(user.id, newSessionId);

      // Conditional close: only wins if no concurrent request already superseded or revoked
      // this very row between the lookup above and now.
      const closed = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null, supersededAt: null },
        data: { supersededAt: new Date(), successorId: newSessionId },
      });
      if (closed.count === 0) {
        // Lost the race: re-read the row as the winner left it and defer to the shared path.
        const winner = await tx.session.findUnique({ where: { id: session.id } });
        return { superseded: winner ?? session };
      }

      await tx.session.create({
        data: {
          id: newSessionId,
          userId: user.id,
          refreshTokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
          ipHash,
          userAgent,
          lastUsedAt: new Date(),
        },
      });

      return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
    });

    if ('superseded' in outcome) {
      return this.resolveSuperseded(outcome.superseded, presentedToken);
    }
    return outcome;
  }

  /** Grace window / theft handling for a token whose session was already superseded. */
  private async resolveSuperseded(session: Session, presentedToken: string): Promise<AuthResult> {
    const supersededAt = session.supersededAt;
    const withinGrace =
      supersededAt !== null && Date.now() - supersededAt.getTime() <= REFRESH_REUSE_GRACE_MS;
    const successor = session.successorId
      ? await this.prisma.session.findUnique({ where: { id: session.successorId } })
      : null;

    if (withinGrace && successor && !successor.revokedAt) {
      const user = await this.users.findById(successor.userId);
      if (user) {
        const accessToken = signAccessToken(
          { sub: user.id, sessionId: successor.id },
          this.config.getOrThrow('JWT_SECRET'),
          this.config.get('JWT_ACCESS_TTL') ?? '15m',
        );
        // No new refresh token minted and no cookie rewrite - the successor's cookie,
        // already set by whichever request won the race, must not be clobbered.
        return { accessToken, refreshToken: presentedToken, user: { id: user.id, email: user.email }, skipCookie: true };
      }
    }

    // Beyond the grace window (or successor missing/revoked): treat as genuine reuse of a
    // stale token - likely theft - revoke the whole session family.
    await this.prisma.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new AppError('REFRESH_TOKEN_REUSED', HttpStatus.UNAUTHORIZED);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, supersededAt: null },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, lastUsedAt: true, createdAt: true, expiresAt: true },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!session) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  }

  /** Always 204, whether or not the email exists — no account enumeration (docs/07 §2). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    const token = generateRefreshToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const resetLink = `${this.config.getOrThrow('WEB_APP_URL')}/reset-password?token=${token}`;
    const { subject, text } = passwordResetEmail(user.locale ?? 'fr', resetLink);
    await this.mail.send({ to: user.email, subject, text });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    if (!isPasswordAcceptable(dto.newPassword)) {
      throw new ValidationAppError('PASSWORD_TOO_WEAK');
    }
    const hash = hashRefreshToken(dto.token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new AppError('INVALID_RESET_TOKEN', HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await hashPassword(dto.newPassword, this.config.get('ARGON_MEMORY_COST') ?? 19456);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: resetToken.userId }, data: { revokedAt: new Date() } }),
    ]);
  }

  async changePassword(userId: string, sessionId: string, dto: ChangePasswordDto): Promise<void> {
    if (!isPasswordAcceptable(dto.newPassword)) {
      throw new ValidationAppError('PASSWORD_TOO_WEAK');
    }
    const user = await this.users.findById(userId);
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new AppError('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }
    const passwordHash = await hashPassword(dto.newPassword, this.config.get('ARGON_MEMORY_COST') ?? 19456);
    // Mirrors `resetPassword`: caller's session stays alive, every other device must log in again.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, id: { not: sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
