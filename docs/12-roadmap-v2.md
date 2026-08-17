# 12 — V2 roadmap (detailed)

Detailed breakdown of the 9 V2 items listed in `09-roadmap.md § V2`, in the same priority
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

## Lot 14 — OFX/QIF import (≈ 3 days)

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

## Lot 15 — Mobile application decision (≈ 1–2 days, spike not build)

- This lot is a decision, not an implementation: evaluate installable-PWA-only vs React Native
  against actual post-MVP usage data (device mix, retention, push-notification reliability gaps
  on iOS observed in lot 7), per the roadmap's explicit "decision to be made based on feedback".
- Deliverable: an ADR in `docs/adr/` recording the decision and rationale.
- If React Native is chosen, its implementation is scoped as a separate, later effort — not part
  of this V2 pass.

**Exit criterion**: ADR merged with a clear go/no-go and rationale.

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

## Verification milestones

| Milestone | Verification |
|---|---|
| End of lot 10 | Payoff-strategy comparison matches independent calculation to the cent |
| End of lot 12 | No-provider behavior unchanged from pre-lot-12 manual-only baseline |
| End of lot 13 | Attachment isolation test passes (no cross-user access) |
| End of lot 14 | Real OFX and QIF sample files import without manual correction |
| End of lot 16 | Dashboard layout customization covered end-to-end |
