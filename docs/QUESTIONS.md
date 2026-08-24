# Open questions

## RG-RP2 — multi-currency conversion in reports (batch 6)

RG-RP2 (docs/04-modules.md §J) requires that conversion use **the rate at the date of each transaction**. An
exact implementation assumes either a per-row SQL join against the rate history, or an in-memory load of the
transactions to convert — which conflicts with RG-RP1 ("all aggregates in SQL, never
in-memory loading").

**Implemented behavior (conservative):** totals are first aggregated in SQL by currency, then each
total per currency is converted to the consolidation currency using **the rate applicable at the report's
period end date** (or today's date for instant reports), rather than a per-transaction rate.
The report indicates the consolidation currency; the conversion method is not yet displayed on screen.

Impact: negligible for a single-currency user (the most common fixed XOF/EUR case); may introduce a
discrepancy for a multi-currency history with rates changed between two dates. To be fixed if multi-currency
users report a perceptible discrepancy.

## Attachments — mime allowlist, size cap, storage adapter (Lot 13)

`docs/12-roadmap-v2.md` §Lot 13 doesn't pin exact numbers ("conservative default limits ... since the
spec doesn't pin exact numbers").

**Implemented behavior (conservative):**
- Mime allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/heic` only — a receipt is a photo, not
  an arbitrary document (no PDF for now).
- Size cap: 10 MB, mirroring the existing `UPLOAD_MAX_BYTES` default already reserved in `env.schema.ts`.
- Storage adapter: only the local-disk implementation exists. The roadmap describes an optional
  S3-compatible adapter, but no S3 SDK dependency is present in this repo yet — adding one is a call
  beyond this lot's scope. `StorageAdapter` (`common/storage/storage.interface.ts`) is designed so an
  S3-backed implementation can be added later without touching `AttachmentsService` or its callers.

Impact: a receipt saved as PDF or over 10 MB is rejected with a clear validation error rather than
silently accepted. Revisit if users report either limit as too tight.

## Audit interceptor — behavior when the audit write fails

The rules require one audit entry per mutation (docs/10-conventions-dev.md §6), but when the `audit_log`
INSERT fails after the business mutation already committed (connection drop, constraint error), the
interceptor cannot roll the mutation back.

**Implemented behavior (conservative):** the interceptor awaits the write as part of the response stream and
rethrows the failure after logging it (`audit_write_failed code=… message=…`, payload never logged). The client
gets an error even though the change is committed; the opposite trade-off (return 200 with a hole in the trail)
would silently violate the one-entry-per-mutation rule.

Impact: rare transient failures surface as errors on already-applied mutations, so clients retrying must
tolerate replayed writes (idempotent POST replay is already required by docs/10 §6). Revisit if audit-table
availability becomes an operational concern.
