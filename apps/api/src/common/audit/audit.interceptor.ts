import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { defer, Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { RawPrismaService } from '../prisma/prisma.service';
import { AUDIT_LOAD_BEFORE_KEY, AUDIT_METADATA_KEY, AuditBeforeLoader, AuditMetadata } from './audit.decorator';

/** Never persisted in `before`/`after`, whatever the entity (docs/03 §14). */
const SENSITIVE_FIELDS = new Set(['passwordHash', 'refreshTokenHash', 'tokenHash', 'token', 'accessToken', 'refreshToken']);

function redact(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  if (typeof (value as { toString?: unknown }).toString === 'function' && (value as object).constructor?.name !== 'Object') {
    return value.toString();
  }
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_FIELDS.has(key))
      .map(([key, v]) => [key, redact(v)]),
  );
}

interface RequestWithContext extends Request {
  requestId?: string;
  user?: { id: string };
  ipHash?: string;
  __auditBefore?: unknown;
}

/**
 * Global interceptor: any handler annotated with `@Audit(...)` produces exactly one
 * append-only AuditLog row after a successful mutation (docs/03 §14, CLAUDE.md).
 * Writes through `RawPrismaService` — AuditLog is a technical table, not soft-deletable.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly raw: RawPrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<AuditMetadata | undefined>(AUDIT_METADATA_KEY, context.getHandler());
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const loadBefore = this.reflector.get<AuditBeforeLoader | undefined>(AUDIT_LOAD_BEFORE_KEY, context.getHandler());

    // The pre-mutation snapshot must be read BEFORE the handler runs, or it captures the "after" state.
    return defer(async () => {
      request.__auditBefore = loadBefore ? await loadBefore(request) : null;
    }).pipe(
      concatMap(() => next.handle()),
      concatMap(async (result) => {
        try {
          await this.raw.auditLog.create({
            data: {
              userId: request.user?.id ?? null,
              actorType: 'USER',
              action: metadata.action,
              entityType: metadata.entityType,
              entityId: (result as { id?: string })?.id ?? null,
              before: redact(request.__auditBefore ?? null) as object | undefined,
              after: redact(result) as object | undefined,
              metadata: { path: request.originalUrl, method: request.method },
              ipHash: request.ipHash ?? null,
              userAgent: request.headers['user-agent'] ?? null,
              requestId: request.requestId ?? null,
            },
          });
        } catch (error) {
          // The mutation is already committed and cannot be rolled back — surface the failure
          // instead of swallowing it (docs/03 §14). Log the code/message only, never a payload.
          const code = (error as { code?: string }).code ?? 'UNKNOWN';
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`audit_write_failed code=${code} message=${message}`);
          throw error;
        }
        return result;
      }),
    );
  }
}
