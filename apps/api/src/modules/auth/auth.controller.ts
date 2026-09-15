import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import type { OAuthProvider as OAuthProviderName } from '../../generated/prisma/client';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { hashIp } from '../../common/security/ip-hash';
import { AppError } from '../../common/errors/app-error';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  OAuthCompleteDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  oauthCompleteSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './dto/auth.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_COOKIE_PATH = '/api/v1/auth';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** URL segment <-> Prisma enum. Also the whitelist for `:provider` (defense-in-depth against route shadowing). */
const OAUTH_PROVIDER_PARAMS: Record<string, OAuthProviderName> = { google: 'GOOGLE', github: 'GITHUB' };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: true,
      // Front-end (Vercel) and API run on different domains — cross-site by definition.
      // 'strict'/'lax' would never let the browser attach this cookie to the fetch() refresh call.
      sameSite: 'none',
      path: REFRESH_COOKIE_PATH,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private ipHash(req: Request): string {
    return hashIp(req.ip ?? 'unknown', this.config.getOrThrow('IP_HASH_SALT'));
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Audit({ action: 'auth.register', entityType: 'User' })
  async register(@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('email/verify')
  @Audit({ action: 'auth.email_verify', entityType: 'User' })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmail(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.email_resend', entityType: 'User' })
  async resendVerification(@Body(new ZodValidationPipe(resendVerificationSchema)) dto: ResendVerificationDto) {
    await this.authService.resendVerification(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('login')
  @Audit({ action: 'auth.login', entityType: 'User' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, this.ipHash(req), req.headers['user-agent'] ?? null);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  @Audit({ action: 'auth.refresh', entityType: 'Session' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) {
      throw new UnauthorizedException();
    }
    const result = await this.authService.refresh(presented, this.ipHash(req), req.headers['user-agent'] ?? null);
    if (!result.skipCookie) {
      this.setRefreshCookie(res, result.refreshToken);
    }
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.logout', entityType: 'Session' })
  async logout(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.sessionId);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.session_revoke', entityType: 'Session' })
  async logoutAll(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(user.id);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: RequestUser) {
    return this.authService.listSessions(user.id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.session_revoke', entityType: 'Session' })
  revokeSession(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.id, id);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.password_forgot', entityType: 'User' })
  async forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.password_reset', entityType: 'User' })
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.password_change', entityType: 'User' })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.id, user.sessionId, dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('oauth/complete')
  @Audit({ action: 'auth.oauth_complete', entityType: 'User' })
  async completeOAuthSignup(
    @Body(new ZodValidationPipe(oauthCompleteSchema)) dto: OAuthCompleteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.completeOAuthSignup(dto, this.ipHash(req), req.headers['user-agent'] ?? null);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Get('oauth-accounts')
  listOAuthAccounts(@CurrentUser() user: RequestUser) {
    return this.authService.listOAuthAccounts(user.id);
  }

  @Delete('oauth-accounts/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'auth.oauth_unlink', entityType: 'OAuthAccount' })
  unlinkOAuthAccount(@CurrentUser() user: RequestUser, @Param('provider') providerParam: string) {
    const provider = OAUTH_PROVIDER_PARAMS[providerParam];
    if (!provider) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return this.authService.unlinkOAuthAccount(user.id, provider);
  }

  // Dynamic `:provider` routes come last on purpose: a request for any static path above
  // (e.g. "sessions") must resolve to that literal handler first, never be swallowed by `:provider`.

  @Public()
  @Get(':provider')
  redirectToOAuthProvider(@Param('provider') providerParam: string, @Res() res: Response) {
    const provider = OAUTH_PROVIDER_PARAMS[providerParam];
    if (!provider) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const state = randomBytes(32).toString('base64url');
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      // Top-level GET navigation back from the provider's own origin to ours — the one case
      // 'lax' is designed for. Different from the refresh cookie: that one is read by a
      // cross-site fetch() from the web app, this one only by a same-origin browser redirect.
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_STATE_TTL_MS,
    });
    const url = this.authService.buildOAuthAuthorizeUrl(provider, state);
    res.redirect(HttpStatus.FOUND, url);
  }

  @Public()
  @Get(':provider/callback')
  @Audit({ action: 'auth.oauth_callback', entityType: 'User' })
  async handleOAuthCallback(
    @Param('provider') providerParam: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request & { user?: { id: string } },
    @Res() res: Response,
  ) {
    const webAppUrl = this.config.getOrThrow<string>('WEB_APP_URL');
    const provider = OAUTH_PROVIDER_PARAMS[providerParam];
    const stateCookie = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_COOKIE_PATH });

    if (!provider || !code || !state || !stateCookie || state !== stateCookie) {
      res.redirect(HttpStatus.FOUND, `${webAppUrl}/login?error=OAUTH_FAILED`);
      return { outcome: 'state_mismatch' };
    }

    const outcome = await this.authService.handleOAuthCallback(provider, code, this.ipHash(req), req.headers['user-agent'] ?? null);

    if (outcome.kind === 'error') {
      res.redirect(HttpStatus.FOUND, `${webAppUrl}/login?error=${outcome.code}`);
      return { outcome: 'error', code: outcome.code };
    }

    if (outcome.kind === 'pending') {
      res.redirect(HttpStatus.FOUND, `${webAppUrl}/register/oauth?token=${outcome.redirectToken}`);
      return { outcome: 'pending' };
    }

    // outcome.kind === 'login' — set the audit actor before returning so the AuditInterceptor,
    // which reads request.user after this handler resolves, attributes the row to this user.
    req.user = { id: outcome.user.id };
    this.setRefreshCookie(res, outcome.refreshToken);
    res.redirect(HttpStatus.FOUND, `${webAppUrl}/accounts`);
    return { outcome: 'login', email: outcome.user.email };
  }
}
