import 'reflect-metadata';
import { Controller, ExecutionContext, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle, ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';
import { AssistantController } from '../../../modules/assistant/assistant.controller';
import {
  IpThrottlerGuard,
  THROTTLE_PER_USER_KEY,
  ThrottlePerUser,
  UserThrottlerGuard,
} from '../per-user-throttling';

@Controller('flagged')
@ThrottlePerUser()
class FlaggedController {
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  list() {
    return [];
  }
}

@Controller('plain')
class PlainController {
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  list() {
    return [];
  }
}

function contextFor(controller: new () => unknown, request: { ip: string; user?: { id: string } }): ExecutionContext {
  const res = { header: () => undefined };
  return {
    getClass: () => controller,
    getHandler: () => (controller as unknown as { prototype: { list: () => unknown } }).prototype.list,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, ...request }), getResponse: () => res }),
  } as unknown as ExecutionContext;
}

async function guards() {
  const options = [{ ttl: 60_000, limit: 100 }];
  const reflector = new Reflector();
  const ip = new IpThrottlerGuard(options, new ThrottlerStorageService(), reflector);
  const user = new UserThrottlerGuard(options, new ThrottlerStorageService(), reflector);
  await ip.onModuleInit();
  await user.onModuleInit();
  return { ip, user };
}

describe('per-user throttling', () => {
  it('gives each user their own budget behind one shared address', async () => {
    const { user } = await guards();
    const alice = { ip: '10.0.0.1', user: { id: 'alice' } };
    const bob = { ip: '10.0.0.1', user: { id: 'bob' } };

    await user.canActivate(contextFor(FlaggedController, alice));
    await user.canActivate(contextFor(FlaggedController, alice));
    await expect(user.canActivate(contextFor(FlaggedController, alice))).rejects.toBeInstanceOf(ThrottlerException);

    // Same IP, another user: untouched by Alice's requests.
    await expect(user.canActivate(contextFor(FlaggedController, bob))).resolves.toBe(true);
  });

  it('follows the user across addresses', async () => {
    const { user } = await guards();

    await user.canActivate(contextFor(FlaggedController, { ip: '10.0.0.1', user: { id: 'alice' } }));
    await user.canActivate(contextFor(FlaggedController, { ip: '10.0.0.2', user: { id: 'alice' } }));
    await expect(
      user.canActivate(contextFor(FlaggedController, { ip: '10.0.0.3', user: { id: 'alice' } })),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('leaves a flagged route to the user guard: the IP guard does not count it', async () => {
    const { ip } = await guards();
    const request = { ip: '10.0.0.1', user: { id: 'alice' } };

    for (let index = 0; index < 5; index += 1) {
      await expect(ip.canActivate(contextFor(FlaggedController, request))).resolves.toBe(true);
    }
  });

  it('keeps counting every other route by IP, and the user guard ignores them', async () => {
    const { ip, user } = await guards();
    const request = { ip: '10.0.0.1', user: { id: 'alice' } };

    for (let index = 0; index < 5; index += 1) {
      await expect(user.canActivate(contextFor(PlainController, request))).resolves.toBe(true);
    }
    await ip.canActivate(contextFor(PlainController, request));
    await ip.canActivate(contextFor(PlainController, request));
    await expect(ip.canActivate(contextFor(PlainController, { ip: '10.0.0.1', user: { id: 'bob' } }))).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('is what the assistant routes use', () => {
    expect(Reflect.getMetadata(THROTTLE_PER_USER_KEY, AssistantController)).toBe(true);
  });
});
