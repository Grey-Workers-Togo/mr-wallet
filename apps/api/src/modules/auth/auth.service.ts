import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Session } from '@prisma/client';
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
import {
  ChangePasswordDto,
  LoginDto,
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

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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
    const passwordValid = user ? await verifyPassword(user.passwordHash, dto.password) : false;

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

  private async createSessionAndTokens(
    userId: string,
    email: string,
    ipHash: string | null,
    userAgent: string | null,
  ): Promise<AuthResult> {
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
    return { accessToken, refreshToken, user: { id: userId, email } };
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
    if (!user || !(await verifyPassword(user.passwordHash, dto.currentPassword))) {
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
