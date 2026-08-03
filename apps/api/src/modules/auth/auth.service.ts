import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError, ConflictAppError, ValidationAppError } from '../../common/errors/app-error';
import { UsersFacade } from '../users/users.facade';
import { CategoriesFacade } from '../categories/categories.facade';
import { hashPassword, isPasswordAcceptable, verifyPassword } from './domain/password';
import { generateRefreshToken, hashRefreshToken, refreshTokenMatches } from './domain/refresh-token';
import { signAccessToken } from '../../common/auth/jwt.util';
import { assertNotLocked, recordFailure, recordSuccess } from './login-throttle';
import { ChangePasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
  /** True when the refresh cookie must NOT be overwritten (see `refresh()` grace-window path). */
  skipCookie?: boolean;
}

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * Refresh tokens rotate on every use. Two tabs/requests racing on the same expired
 * access token can both present the same (about-to-be-superseded) refresh token; without
 * this grace window the second one looks like theft and revokes every session (docs bug:
 * "Authentification requise" appearing app-wide after brief inactivity). Within this window
 * a superseded token still resolves to its successor session instead of nuking the family.
 */
const REFRESH_REUSE_GRACE_MS = 10_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersFacade,
    private readonly categories: CategoriesFacade,
    private readonly config: ConfigService,
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

  async register(dto: RegisterDto): Promise<AuthResult> {
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

    return this.createSessionAndTokens(user.id, user.email, null, null);
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

    recordSuccess(dto.email, ipHash);
    await this.users.markLastLogin(user.id);
    return this.createSessionAndTokens(user.id, user.email, ipHash, userAgent);
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

  /** Rotation: the presented refresh token is immediately superseded, a new one issued (docs/07 §2). */
  async refresh(presentedToken: string, ipHash: string, userAgent: string | null): Promise<AuthResult> {
    const hash = hashRefreshToken(presentedToken);
    const session = await this.prisma.session.findFirst({ where: { refreshTokenHash: hash } });

    if (!session) {
      throw new AppError('INVALID_REFRESH_TOKEN', HttpStatus.UNAUTHORIZED);
    }

    if (session.supersededAt) {
      const withinGrace = Date.now() - session.supersededAt.getTime() <= REFRESH_REUSE_GRACE_MS;
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

    await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: session.id },
        data: { supersededAt: new Date(), successorId: newSessionId },
      }),
      this.prisma.session.create({
        data: {
          id: newSessionId,
          userId: user.id,
          refreshTokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
          ipHash,
          userAgent,
          lastUsedAt: new Date(),
        },
      }),
    ]);

    return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
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
    // Sending the email itself is out of scope for Lot 1 (no transactional email provider wired yet).
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

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    if (!isPasswordAcceptable(dto.newPassword)) {
      throw new ValidationAppError('PASSWORD_TOO_WEAK');
    }
    const user = await this.users.findById(userId);
    if (!user || !(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new AppError('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);
    }
    const passwordHash = await hashPassword(dto.newPassword, this.config.get('ARGON_MEMORY_COST') ?? 19456);
    await this.users.updatePasswordHash(userId, passwordHash);
  }
}
