import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RawPrismaService } from '../prisma/prisma.service';
import { AUDIT_METADATA_KEY, AuditMetadata } from './audit.decorator';

/** Never persisted in `before`/`after`, whatever the entity (docs/03 §14). */
const SENSITIVE_FIELDS = new Set(['passwordHash', 'refreshTokenHash', 'tokenHash', 'token', 'accessToken', 'refreshToken']);

function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
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
}

/**
 * Global interceptor: any handler annotated with `@Audit(...)` produces exactly one
 * append-only AuditLog row after a successful mutation (docs/03 §14, CLAUDE.md).
 * Writes through `RawPrismaService` — AuditLog is a technical table, not soft-deletable.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
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
    const before = redact(request.body?.__auditBefore ?? null);

    return next.handle().pipe(
      tap(async (result) => {
        await this.raw.auditLog.create({
          data: {
            userId: request.user?.id ?? null,
            actorType: 'USER',
            action: metadata.action,
            entityType: metadata.entityType,
            entityId: (result as { id?: string })?.id ?? null,
            before: before as object | undefined,
            after: redact(result) as object | undefined,
            metadata: { path: request.originalUrl, method: request.method },
            ipHash: request.ipHash ?? null,
            userAgent: request.headers['user-agent'] ?? null,
            requestId: request.requestId ?? null,
          },
        });
      }),
    );
  }
}
