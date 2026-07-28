import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface RequestUser {
  id: string;
  sessionId: string;
}

/**
 * The only source of `userId` for scoping queries (docs/07 §3):
 * always from the verified token, never from a route or query parameter.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
  if (!request.user) {
    throw new Error('CurrentUser used outside an authenticated route');
  }
  return request.user;
});
