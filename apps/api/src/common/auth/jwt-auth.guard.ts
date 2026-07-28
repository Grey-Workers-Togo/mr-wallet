import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppError } from '../errors/app-error';
import { HttpStatus } from '@nestjs/common';
import { verifyAccessToken } from './jwt.util';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestUser } from './current-user.decorator';

/**
 * Global guard (docs/05-api.md §0): every endpoint requires `Authorization: Bearer <token>`
 * except those marked `@Public()`. Access tokens are short-lived (15 min); revoked sessions
 * are only rejected at the next `/auth/refresh`, a deliberate trade-off documented in docs/07 §2.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }

    const token = header.slice('Bearer '.length);
    try {
      const payload = verifyAccessToken(token, this.config.getOrThrow('JWT_SECRET'));
      request.user = { id: payload.sub, sessionId: payload.sessionId };
      return true;
    } catch {
      throw new AppError('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }
  }
}
