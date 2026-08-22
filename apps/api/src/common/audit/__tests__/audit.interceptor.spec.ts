import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { AuditInterceptor } from '../audit.interceptor';
import { AUDIT_LOAD_BEFORE_KEY, AUDIT_METADATA_KEY } from '../audit.decorator';

function fakeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, ...request }) }),
    getHandler: () => () => undefined,
  } as unknown as ExecutionContext;
}

function makeInterceptor(metadata: unknown, loadBefore?: unknown) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'get').mockImplementation((key: unknown) =>
    key === AUDIT_METADATA_KEY ? metadata : key === AUDIT_LOAD_BEFORE_KEY ? loadBefore : undefined,
  );
  const create = vi.fn().mockResolvedValue({});
  const interceptor = new AuditInterceptor(reflector, { auditLog: { create } } as never);
  return { interceptor, create };
}

describe('AuditInterceptor', () => {
  const metadata = { action: 'goal.create', entityType: 'SavingsGoal' };

  it('stores the loaded snapshot as `before` and the result as `after`, redacted', async () => {
    const request: Record<string, unknown> = {
      user: { id: 'u1' },
      ipHash: 'abc123',
      requestId: 'r1',
    };
    const { interceptor, create } = makeInterceptor(metadata, async () => ({ id: 'g1', name: 'Trip', passwordHash: 'x' }));
    const handler: CallHandler = { handle: () => of({ id: 'g1', name: 'Trip' }) };

    const result = await lastValueFrom(interceptor.intercept(fakeContext(request), handler));

    expect(result).toEqual({ id: 'g1', name: 'Trip' });
    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0][0].data;
    expect(data.before).toEqual({ id: 'g1', name: 'Trip' });
    expect(data.before).not.toHaveProperty('passwordHash');
    expect(data.after).toEqual({ id: 'g1', name: 'Trip' });
    expect(data.userId).toBe('u1');
    expect(data.ipHash).toBe('abc123');
    expect(data.requestId).toBe('r1');
    expect(data.action).toBe('goal.create');
  });

  it('keeps `before` null when the handler declares no loader', async () => {
    const { interceptor, create } = makeInterceptor(metadata);
    const handler: CallHandler = { handle: () => of({ id: 'g2' }) };

    await lastValueFrom(interceptor.intercept(fakeContext({}), handler));

    expect(create.mock.calls[0][0].data.before).toBeNull();
  });

  it('passes handlers without @Audit metadata through untouched', async () => {
    const { interceptor, create } = makeInterceptor(undefined);
    const handler: CallHandler = { handle: () => of('plain') };

    const result = await lastValueFrom(interceptor.intercept(fakeContext({}), handler));

    expect(result).toBe('plain');
    expect(create).not.toHaveBeenCalled();
  });

  it('surfaces an audit write failure instead of swallowing it', async () => {
    const { interceptor, create } = makeInterceptor(metadata);
    create.mockRejectedValueOnce(Object.assign(new Error('db down'), { code: 'P1001' }));
    const handler: CallHandler = { handle: () => of({ id: 'g3' }) };

    await expect(lastValueFrom(interceptor.intercept(fakeContext({}), handler))).rejects.toThrow('db down');
  });

  it('does not mask a handler error with its own stream plumbing', async () => {
    const { interceptor, create } = makeInterceptor(metadata);
    const handler: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(fakeContext({}), handler))).rejects.toThrow('boom');
    expect(create).not.toHaveBeenCalled();
  });
});
