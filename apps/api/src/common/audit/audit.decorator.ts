import { SetMetadata } from '@nestjs/common';
import { Request } from 'express';

export const AUDIT_METADATA_KEY = 'audit:metadata';
export const AUDIT_LOAD_BEFORE_KEY = 'audit:load-before';

export interface AuditMetadata {
  action: string; // e.g. "transaction.create"
  entityType: string; // e.g. "Transaction"
}

/** Resolves the entity state BEFORE the mutation — identifiers come from the request (params, body). */
export type AuditBeforeLoader = (request: Request) => Promise<unknown>;

/** Marks a controller handler as producing one AuditLog entry (docs/03 §14, CLAUDE.md "Horodatage et traçabilité"). */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_METADATA_KEY, metadata);

/**
 * Declares the async loader of the pre-mutation snapshot; awaited by `AuditInterceptor` before the
 * handler runs and persisted as the audit row's `before` (docs/10 §6). Handlers without it keep `before: null`.
 */
export const AuditLoadBefore = (loader: AuditBeforeLoader) => SetMetadata(AUDIT_LOAD_BEFORE_KEY, loader);
