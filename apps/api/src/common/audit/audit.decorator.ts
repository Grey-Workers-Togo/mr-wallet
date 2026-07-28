import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA_KEY = 'audit:metadata';

export interface AuditMetadata {
  action: string; // e.g. "transaction.create"
  entityType: string; // e.g. "Transaction"
}

/** Marks a controller handler as producing one AuditLog entry (docs/03 §14, CLAUDE.md "Horodatage et traçabilité"). */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_METADATA_KEY, metadata);
