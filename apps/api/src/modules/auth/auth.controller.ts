import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { hashIp } from '../../common/security/ip-hash';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './dto/auth.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth/refresh';

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
      sameSite: 'strict',
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
  @Audit({ action: 'auth.register', entityType: 'User' })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
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
    await this.authService.changePassword(user.id, dto);
  }
}
