# Open questions

## `RECONCILE_REMINDER` skips an account already reconciled this month (lot 20)

RG-N15 states the reminder is "monthly" for `CASH`/`MOBILE_MONEY` accounts but doesn't say whether
it should still fire on schedule for an account the user has already reconciled since the last
run — a purely calendar-driven nudge would do that; a reminder that ignores what the user already
did would be exactly the "nags" behavior RG-N13 explicitly calls out as a reason to uninstall
(stated for `ENTRY_REMINDER`, but the same product reasoning applies here).

**Implemented behavior (conservative):** `notifyReconcileReminders()` skips an account whose
`Account.lastReconciledAt` already falls in the current calendar month, on top of the required
monthly cadence and per-(account, month) dedupe.

Impact: a user who reconciles early in the month gets no further nudge until next month, even if
the cron's own monthly tick would otherwise have fired. Revisit if product feedback wants a purely
schedule-driven reminder regardless of recent activity.

## `attachment.create` excluded from the M0 sync catalogue

`docs/14-sync-protocol.md § 2.1` lists `attachment.create` as metadata-only — the binary is
uploaded separately on reconnection. But the only existing creation path
(`AttachmentsService.upload()`) requires an actual `Express.Multer.File` and derives
`storageKey`/`mimeType`/`sizeBytes` from it; `Attachment.storageKey` is `NOT NULL` in the schema
today, with no metadata-only row ever created. Adding that path means guessing a schema shape
(nullable `storageKey`? a placeholder value?) for a consumer that doesn't exist yet — attachment
sync is mobile lot M5, explicitly out of scope for this pass.

**Implemented behavior (conservative):** `attachment.create` is left out of
`packages/sync-protocol`'s `OPERATION_NAMES` for now. `POST /sync/push` never sees it. Adding it
back is M5's job, in the same commit as whatever schema change it actually needs once there's a
real client to validate the shape against (RG-SY5).

Impact: none today — no client exists to send this operation. Revisit when M5 is actually built.

## Idempotency scope for `Operation.id` (M0)

`docs/02-architecture.md § 7`'s "creation endpoints accept an `Idempotency-Key` header... reuses
the existing mechanism" describes something that was never actually built: only the
`IdempotencyKey` Prisma model exists, unread and unwritten anywhere before this lot.

**Implemented behavior (conservative):** idempotency-key read/write is implemented **inside the
sync module only**, scoped to `endpoint: 'sync.push'`. RG-SY2 only requires it for sync;
retrofitting a generic interceptor onto every existing plain-REST POST endpoint is materially
larger scope than M0 asks for.

Impact: plain REST creation endpoints (`POST /accounts`, `POST /transactions`, …) still rely only
on the client-supplied `id` for replay safety (RG-SY3), not on the `Idempotency-Key` header the
architecture doc describes. Revisit if a generic idempotency interceptor is wanted for the plain
REST API later.

## RG-A14 deferred (lot 19)

"Large/recurring adjustment flagged plainly" (`docs/04-modules.md § B`) is a UI-facing rule with
no consumer while the web front is out of scope for this pass.

**Implemented behavior (conservative):** deferred entirely — no API field added for it yet.
Building one with nothing to read it is speculative.

Impact: none observable today. Revisit once a front-end change for reconciliation is actually
planned.


## Reconciliation adjustment — `description` field (lot 19)

RG-A9 requires the adjustment to be "a normal transaction" but doesn't say what its `description`
should be. `Transaction.description` is `NOT NULL` and, per CLAUDE.md's "Langues" rule, the
database must never contain a server-authored human-readable phrase (no `"Reconciliation for " +
account.name`-style concatenation) — the same reasoning `createFeeLine` already follows by reusing
its parent's own `description` rather than inventing one.

**Implemented behavior (conservative):** the adjustment's `description` is the account's own name
(`account.name`) — existing user data, not synthesized text, and immediately meaningful in history
("Cash wallet", not a generic label). Its category (`category.expense.adjustment`, `i18nKey`-only)
is what actually identifies it as an adjustment in the UI.

Impact: two reconciliations on the same account produce two transactions with an identical
description, distinguished only by date/amount — acceptable since the category and amount already
make each one legible. Revisit if product feedback wants a richer per-adjustment label.

## Social login — auto-link vs. conflict when the provider doesn't vouch for the email (Lot 21)

The user confirmed auto-linking an OAuth login onto an existing password account when the emails
match, but didn't specify what happens when the provider reports that email as **unverified**.
Auto-linking anyway would let anyone take over an existing account just by registering its email
address at Google or GitHub, without ever proving they own it.

**Implemented behavior (conservative):** refuse — `OAUTH_EMAIL_UNVERIFIED_CONFLICT` — and tell the
user to log in with their password instead. No account is silently linked or created.

Impact: a user whose provider account has a genuinely unverified email at that provider cannot
use social login for an account that already exists under the same address; they can still use
their password, or verify the email at the provider and retry. Revisit only if this turns out to
block a real, legitimate flow in practice.

## Social login — no default `baseCurrency` for a brand-new OAuth identity (Lot 21)

`register()` has always required the client to explicitly pick a `baseCurrency` — there is no
default anywhere in the app, because guessing a financial invariant like the account's
consolidation currency is exactly the kind of business rule this project refuses to invent
silently. A brand-new Google/GitHub identity has no natural source for one either.

**Implemented behavior (conservative):** don't create the `User` row on the OAuth callback at
all. Instead, a short-lived, single-use `PendingOAuthSignup` token (opaque, same shape as
`PasswordResetToken`/`EmailVerificationToken` — never a JWT) carries the provider identity to a
one-field "pick a currency" step (`POST /auth/oauth/complete`), which only then creates the
account — mirroring `register()`'s own explicit-currency requirement instead of guessing.

Impact: a brand-new social signup takes one extra step compared to an existing account's social
login. Revisit only if product feedback says this friction is worse than a guessed default would
have been.

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
