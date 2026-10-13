import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting by authenticated user instead of by IP, for the routes that opt in.
 *
 * Why: in the markets this app serves, many users share the NAT address of their mobile operator, so a
 * per-IP budget is shared with strangers. The IP guard runs first (docs/05-api.md §17) and cannot know
 * the user; the per-user guard runs after `JwtAuthGuard`, once `request.user` exists.
 *
 * A route is flagged with `@ThrottlePerUser()` (class or handler). The limit itself is the usual
 * `@Throttle(...)`, or the module default.
 */
export const THROTTLE_PER_USER_KEY = 'throttle:per-user';

export const ThrottlePerUser = () => SetMetadata(THROTTLE_PER_USER_KEY, true);

function isPerUser(reflector: Reflector, context: ExecutionContext): boolean {
  return reflector.getAllAndOverride<boolean | undefined>(THROTTLE_PER_USER_KEY, [context.getHandler(), context.getClass()]) === true;
}

/** Global, before authentication: keeps counting by IP, except on the routes counted per user. */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return isPerUser(this.reflector, context);
  }
}

/** Global, after authentication: counts by `userId` on the flagged routes only, and ignores the others. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return !isPerUser(this.reflector, context);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id?: string } | undefined;
    // A flagged route is never public; without a user, fall back to the address rather than not counting.
    return user?.id ? `user:${user.id}` : super.getTracker(req);
  }
}
