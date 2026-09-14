# 12 — V2 roadmap (detailed)

Detailed breakdown of the 10 V2 items listed in `09-roadmap.md § V2`, in the same priority
order, as sequential lots continuing the MVP numbering (lots 0–7). Same rules apply: each lot
ends functional and tested, definition of done per `10-conventions-dev.md`, do not skip a lot.

Grounded against current code state (checked before writing this doc):

- `transactions` list filters (`listTransactionsSchema`) support single-value `accountId`,
  `categoryId`, `type`, `from`/`to`, `minAmountMinor`/`maxAmountMinor`, `q` — no multi-value
  arrays, no tag filter, no `payee` filter, no saved-search model.
- `forecasting` only exposes `GET /forecast/cashflow` and `GET /forecast/net-worth`. No
  `scenario` endpoint exists yet.
- `debts.service.ts` already has `simulatePayoff()` (per-debt extra-payment projection) and the
  full amortization engine — no cross-debt ranking/allocation exists yet.
- `NotificationsService` already has an `emailEnabled` preference field, but nothing sends email.
  `apps/api/src/common/mail/mail.service.ts` (nodemailer, SMTP env-configured, no-ops if
  `SMTP_HOST` unset) already exists and is used by `auth` for verification/reset emails only.
- `ExchangeRate.source` enum already includes `PROVIDER`, but `currency.service.ts` always
  writes `MANUAL`. No provider adapter exists.
- No `Attachment` Prisma model exists. `Transaction` has no file/attachment relation.
- `import` supports CSV/TSV and XLSX only (`domain/parse-file.ts`, `domain/sniff.ts`). No
  OFX/QIF parser exists.
- No authenticated dashboard route exists. Users land on `/accounts` after login; each feature
  is its own top-level page, nothing aggregates them into widgets.
- `budgets` already models `Budget` (per-category cap, period, rollover, alert thresholds) and
  `BudgetPeriod` (allocated vs spent) — creation is one budget at a time via `POST /budgets`. No
  bulk/plan endpoint, and the frontend `/budgets` page has no income-entry or allocation-remainder
  UI — each category budget is created independently with no view of the whole period's income.

---

## Lot 8 — Advanced search (≈ 3 days)

- `transactions`: extend `listTransactionsSchema` to accept multi-value `categoryId[]`,
  `tagId[]`, `accountId[]`, plus a `payee` filter (field already exists on the model, unused by
  the filter today).
- New `SavedSearch` table (`userId`, `name`, `filterJson`, standard `createdAt`/`updatedAt`/
  `deletedAt`, audited like any other write).
- Endpoints: `GET /saved-searches`, `POST /saved-searches`, `DELETE /saved-searches/:id`;
  `GET /transactions?savedSearchId=` applies a saved filter set.
- Frontend: multi-select filter panel, "save this search" action, saved-search list with apply/
  delete.
- Tests: a saved search with 5 combined criteria returns identical results to the same filters
  applied manually; deleting a saved search never touches the transactions it matched; isolation
  test (user A cannot read/apply user B's saved search).

**Exit criterion**: saved multi-criteria search reproduces manual filtering exactly, and is
private per user.

---

## Lot 9 — Forecast scenarios (≈ 4 days)

- `forecasting`: new `POST /forecast/scenario` endpoint. Reuses the existing cashflow/net-worth
  projection engine but takes explicit overrides (hypothetical recurring amount changes, one-off
  future amounts, horizon in months) instead of reading live recurrences/budgets.
- Kept stateless: the scenario is computed and returned, not persisted. Do not invent a
  `SavedScenario` model — out of scope unless requested (see CLAUDE.md: don't silently decide
  ambiguous scope, log it in `QUESTIONS.md` if it turns out users need to save scenarios).
- Frontend: adjustable hypothesis inputs, resulting curve rendered alongside the baseline
  forecast for comparison.
- Tests: a scenario changing one recurring expense amount produces a cashflow curve that
  diverges from baseline by exactly the expected delta over 3 simulated months.

**Exit criterion**: scenario output is verifiable by hand against the baseline forecast for a
simple single-variable change.

---

## Lot 10 — Debt payoff strategies (≈ 3 days)

- `debts`: new domain function `rankDebtsForStrategy(debts, strategy)` — pure, alongside
  `amortization.ts`. Avalanche sorts by rate descending, snowball by outstanding balance
  ascending; extra payment is applied to the top-ranked debt and cascades (waterfall) to the next
  once a debt is fully paid off.
- New endpoint `GET /debts/payoff-strategies?extraMinor=&strategy=avalanche|snowball`, built on
  top of the existing `simulatePayoff()` per-debt projection rather than duplicating it.
- Frontend: side-by-side avalanche vs snowball comparison (total interest paid, payoff date) in
  the debts simulator screen.
- Tests: known toy dataset (2-3 debts, fixed rates/balances) matches an independently computed
  comparison to the cent; total interest under either strategy is never worse than the no-extra-
  payment baseline.

**Exit criterion**: strategy comparison on a reference dataset matches manual calculation
exactly.

---

## Lot 11 — Email notifications (≈ 2 days)

- `notifications`: wire `NotificationsService` to the existing `MailService` (already used by
  `auth`, already SMTP-configured, already safely no-ops without `SMTP_HOST`) — no new mail
  infrastructure needed.
- Send an email per notification type when the user's `emailEnabled` preference is true for that
  type. Subject/body rendered server-side at send time from `type` + `params`, using the same
  i18n keys already used for in-app rendering (per CLAUDE.md: DB/API never stores human text).
- Tests: `emailEnabled=true` on a type produces an email on the matching event;
  `emailEnabled=false` sends none; email rendering picks the recipient's locale.

**Exit criterion**: a budget-exceeded event with email opted in produces one correctly localized
email; opted out produces none.

---

## Lot 12 — Advanced multi-currency (≈ 3 days)

- `currency`: `ExchangeRate.source = PROVIDER` is already modeled — add an `ExchangeRateProvider`
  interface with a pluggable adapter, disabled by default (respects CLAUDE.md: no hard dependency
  on a paid FX API in the core; a provider is optional and branchable, per `docs/08-devises.md`).
- Scheduled job refreshes only `PROVIDER`-sourced rates, and only runs if a provider is
  configured via env; with no provider configured, behavior is unchanged from today (manual
  entry only).
- `reporting`: detailed consolidation report showing net-worth/cashflow broken down by original
  currency before conversion, alongside the existing converted total.
- Tests: no-provider-configured behavior is byte-identical to current manual-only behavior; with
  a mock/stub provider, scheduled refresh updates `PROVIDER` rates without touching `MANUAL` or
  `PEGGED` ones.

**Exit criterion**: provider integration is strictly additive — existing manual-rate behavior is
unaffected when no provider is configured.

---

## Lot 13 — Attachments (≈ 3 days)

- New `Attachment` table: `id`, `userId`, `transactionId`, `storageKey`, `mimeType`,
  `sizeBytes`, standard timestamps + soft delete + audit.
- Storage adapter behind an interface (local disk by default, S3-compatible optional via env),
  mirroring the optional-config pattern already used by `mail.service.ts` — no hard cloud
  dependency introduced.
- Conservative default limits (image mime types only, size cap) since the spec doesn't pin exact
  numbers — log the assumption in `docs/QUESTIONS.md` per CLAUDE.md's ambiguity rule.
- Endpoints: `POST /transactions/:id/attachments` (multipart upload), `GET
  /transactions/:id/attachments/:attachmentId` (stream/serve), `DELETE
  /transactions/:id/attachments/:attachmentId`.
- Tests: upload → retrieve → delete round-trip removes the underlying file; isolation test (user
  B cannot fetch or delete user A's attachment by id, even by guessing the id).

**Exit criterion**: a receipt photo survives upload/retrieve/delete correctly and is never
visible cross-user.

---

## Lot 14 — OFX/QIF import (≈ 3 days) — **DEMOTED, see [ADR-0013](adr/0013-native-ingestion-channels.md)**

> OFX and QIF are North American and European bank-export formats, close to nonexistent in the primary
> market. ADR-0013 reprioritizes ingestion around what users there actually receive — transaction SMS
> and PDF statements — and makes collecting real samples a prerequisite (assumption `01 § 8.2`, still
> open). This lot is kept for persona B, but runs **after** lots 18–20 and after the sample collection.


- `import`: new `domain/parse-ofx.ts` and `domain/parse-qif.ts`, feeding the existing
  `mapRow`/`dedupe`/preview/commit pipeline unchanged — same shape as the current CSV/XLSX path
  in `domain/parse-file.ts`.
- `domain/sniff.ts`: extend format detection with file extension + content signature (`<OFX>` /
  `!Type:`) so the existing 4-step wizard auto-detects OFX/QIF without a new UI flow.
- Tests: real-world OFX and QIF sample files import through the same wizard with correct field
  mapping and the same three-level dedupe as CSV today (per lot 3's original exit criterion,
  applied to the new formats).

**Exit criterion**: an OFX and a QIF sample file each import cleanly through the existing wizard,
duplicates against a prior CSV import of the same data are correctly detected.

---

## Lot 15 — Mobile application decision — **CLOSED 2026-09-03**

Decided ahead of schedule, without waiting for post-MVP usage data: the read-only offline cache
(ADR-0008) disables the primary mobile journey (UC-02, quick entry) precisely when a phone is
most likely to be used. That is a design fact, not something usage statistics were needed to
establish.

Outcome — three ADRs instead of one:

- [ADR-0010](adr/0010-offline-first-mobile.md) — offline-first on mobile, server remains the sole
  authority. Supersedes ADR-0004 for the mobile client.
- [ADR-0011](adr/0011-stack-mobile-expo-react-native.md) — Expo / React Native.
- [ADR-0012](adr/0012-mobile-in-the-existing-monorepo.md) — `apps/mobile` in the existing monorepo.

Implementation is scoped as a separate track: `15-roadmap-mobile.md` (lots M0–M8, ≈ 11–12 weeks).
It is not part of this V2 pass, but **lot M0 (server groundwork) must land before any V2 lot
touching a business module**, so that client-supplied entity ids are introduced once rather than
retrofitted module by module.

**Exit criterion**: met — ADRs merged, mobile roadmap written.

---

## Lot 16 — Customizable dashboard (≈ 3 days)

- New `apps/web/src/app/[locale]/dashboard/` route — none exists today; users currently land on
  `/accounts` after login with no aggregating home screen.
- Widget grid pulling from existing endpoints already built in prior lots: net-worth, current
  budgets, debts summary, upcoming recurrences, goals progress. No new backend aggregation
  endpoint needed — widgets call their existing endpoints independently so an unused/removed
  widget makes no request.
- Layout (which widgets, order) persisted client-side (`localStorage`) by default rather than a
  new server-synced preference — keeps this lot additive and avoids a new sync surface; escalate
  to `docs/QUESTIONS.md` if server-side persistence turns out to be required.
- Tests: rearranging/removing widgets survives a reload; a removed widget's endpoint is not
  called.

**Exit criterion**: dashboard widget layout is user-customizable and persists across sessions on
the same device.

---

## Lot 17 — Budget builder, from-scratch (≈ 3 days)

- `budgets`: new `POST /budgets/plan` endpoint — takes a period (`startsOn`/`endsOn`/`period`)
  and a list of `{ categoryId, amountMinor }` allocations, creates one `Budget` (+ its first
  `BudgetPeriod`) per allocation atomically (single DB transaction — a partial failure must not
  leave a half-built plan). Reuses `budgets.service.ts`'s existing single-budget creation path
  internally rather than duplicating its validation.
- Total income for the period is a plain user-entered number, not derived from `recurrence` —
  reading live recurring-income occurrences as a prefill is a reasonable enhancement but not
  required for the exit criterion; if added, it must stay editable (the user's actual income for
  a specific period can differ from the recurring template).
- Frontend: a guided flow at `/budgets/plan` — step 1, enter total income for the period; step 2,
  a category list where each row takes an allocation amount, with a running "allocated / total
  income / remaining" readout that updates live as the user types; step 3, confirm and submit.
  Over-allocation (sum > income) is a visible warning, not a hard block — conservative default
  per CLAUDE.md's ambiguity rule (log to `docs/QUESTIONS.md` if this needs to become a hard
  block).
- Tests: allocating the full income across categories leaves zero remaining and creates exactly
  one `Budget`/`BudgetPeriod` pair per allocated category; a partial-failure case (e.g. one
  invalid `categoryId` among several) creates none of them, not a partial set; isolation test
  (user A's plan never creates a budget visible to user B).

**Exit criterion**: a full income amount, allocated across categories through the guided flow,
produces exactly the expected set of budgets with zero unallocated remainder, or the whole
submission fails together.

---

## Lot 18 — Transaction fees (≈ 2 days)

- `transactions`: `feeForTransactionId` on `Transaction`, `TxSource.FEE`, fee line created in the same SQL
  transaction as its parent (RG-T11 to RG-T16, `04-modules.md § D`). Seed category
  `category.transaction_fees`.
- API: `feeMinor` on the transaction create/update DTO (input) and on the read DTO (computed from the
  fee line, never stored — RG-T12a). Update `05-api.md` accordingly.
- Entry form: **one optional field**, not a second entry — UC-02's 15-second target is the constraint
  that shapes this lot.
- Cascade on modify and delete, extending RG-T4 to the fee line.
- Frontend: fee shown on the transaction detail, and counted like any expense in budgets and reports.
- Tests: a transfer with a fee debits the source account by amount + fee and credits the destination by
  amount; the fee appears in the expense total for its category while the transfer itself stays excluded
  (RG-T5); deleting the parent deletes the fee line; setting `feeMinor` to 0 on an update removes it;
  reading the parent back returns the same `feeMinor` that was sent.

**Exit criterion**: a mobile money withdrawal with a fee, entered in one step, produces exact balances and
a fee visible in "expenses by category".

---

## Lot 19 — Reconciliation against reality (≈ 2 days)

- `accounts`: `POST /accounts/:id/reconcile` taking the **declared actual balance** and a date; the server
  computes the difference and creates the `ADJUSTMENT` transaction (RG-A8 to RG-A14, `04-modules.md § B`).
  `Account.lastReconciledAt`, kept distinct from `balanceCheckedAt`. Seed category `category.adjustment`.
- `reporting`: adjustments excluded from category expense reports, shown as their own explicit
  "unaccounted" line (RG-A10).
- Frontend: reconciliation flow on the account screen, with the computed difference shown before
  confirmation.
- Tests: reconciling to a lower balance creates one `EXPENSE` adjustment of exactly the difference;
  reconciling twice with no activity in between creates nothing the second time; the nightly job never
  creates an adjustment (RG-A11).

**Exit criterion**: a cash account whose real balance is below the computed one is trued up in one action,
with the difference visible and reversible in history.

---

## Lot 20 — Entry reminders (≈ 1 day)

- `notifications`: `ENTRY_REMINDER` and `RECONCILE_REMINDER`, `user.entryReminderDays` (default 3), daily
  job (RG-N12 to RG-N16, `04-modules.md § K`).
- One reminder per inactivity streak, re-armed only after the user enters something again — the rule that
  separates a reminder from nagging.
- Frontend: cadence setting on the preferences screen.
- Tests: 5 days of inactivity produce exactly one notification, not five; entering a transaction re-arms
  the streak; a reminder contains no amount (RG-N14).

**Exit criterion**: an inactive user receives one reminder, and an active one receives none.

---

## Lot 21 — Social login, Google + GitHub (≈ 3 days)

- `auth`: `User.passwordHash` made nullable; new `OAuthAccount` (linked identity) and
  `PendingOAuthSignup` (brand-new identity awaiting a `baseCurrency` choice, since none is ever
  defaulted) tables. `GET/DELETE /auth/oauth-accounts(/:provider)`, `GET /auth/:provider`,
  `GET /auth/:provider/callback`, `POST /auth/oauth/complete` (`05-api.md § 2 bis`,
  `07-securite-audit.md § 2`).
- Provider adapters (`common/oauth/`) talk to Google/GitHub over plain `fetch` — no SDK, no
  Passport, matching the module's existing zero-framework auth style.
- Frontend: "Continue with Google/GitHub" on login and register, a `/register/oauth` step that
  asks only for `baseCurrency` for a brand-new identity, a "connected accounts" list/unlink card
  in preferences.
- Tests: auto-link fires only when the provider reports the email verified; an already-linked
  `OAuthAccount` logs in regardless of what the provider says about the email *today*; unlinking
  the only remaining authentication method is refused; cross-user isolation on list/unlink.

**Exit criterion**: a brand-new Google or GitHub identity reaches an authenticated session
without ever creating a `User` row missing `baseCurrency`; an existing password account with a
verified matching email auto-links on first social login.

---

## Verification milestones

| Milestone | Verification |
|---|---|
| End of lot 10 | Payoff-strategy comparison matches independent calculation to the cent |
| End of lot 12 | No-provider behavior unchanged from pre-lot-12 manual-only baseline |
| End of lot 13 | Attachment isolation test passes (no cross-user access) |
| End of lot 14 | Real OFX and QIF sample files import without manual correction |
| End of lot 16 | Dashboard layout customization covered end-to-end |
| End of lot 17 | A submitted budget plan is all-or-nothing and leaves zero unallocated remainder |
| End of lot 18 | A fee is counted as an expense while its parent transfer stays excluded |
| End of lot 19 | An adjustment is never created without an explicit user action |
| End of lot 20 | An inactivity streak produces exactly one reminder |
| End of lot 21 | Cross-user isolation test passes on `/auth/oauth-accounts` (no cross-user access) |
