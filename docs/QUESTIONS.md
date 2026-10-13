# Open questions

## Marketing site — dynamic vs. static signed-in CTA (Lot 17)

`docs/16-marketing-site-split.md` (Phase 2) needs to decide what the landing page's primary CTA does for
a visitor who already has a valid session. The current `apps/web` implementation calls
`useAuthSession()` client-side and swaps the CTA to "Access my space" when a refresh cookie is present.
Once the marketing site is a separate static Astro deployment, that check can no longer happen for free at
build time, and doing it at runtime means calling `POST {API_URL}/auth/refresh` with `credentials: 'include'`
from the marketing origin — which requires adding `https://mister-wallet.com` to the API's `CORS_ORIGIN`,
widening the set of origins allowed to exchange the refresh cookie for an access token.

**Implemented behavior (conservative):** a single static CTA ("Log in") linking to
`app.mister-wallet.com/fr/login`, with no session check and no CORS change. A signed-in visitor lands on the
login page and is redirected onward by the app's own session handling, rather than skipping it from the
marketing site.

Impact: a returning signed-in user sees one extra click/redirect through `/login` instead of a CTA that
already reads "Access my space". Revisit if conversion data shows this costs meaningfully more than the
CORS surface would.

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

## Assistant and SMS capture (ADR-0016 to ADR-0022)

- **Model provider.** To be selected by the benchmark (French quality, template compliance, latency from Lomé, cost). Record its data-retention terms here when selected (RG-AP7).
- **Langfuse hosting.** Cloud or self-hosted. Traces carry metadata only (RG-AP4), so either is acceptable; self-hosting removes one more third party.
- **Initial quota values.** Daily questions per user and global monthly cost ceiling (RG-AQ1, RG-AQ2), to be set from the benchmark's cost per question.
- **Operator sender whitelist.** Exact sender addresses used by Flooz and Mixx by Yas, to be confirmed on real devices.
- **Real SMS corpus.** Collection with consent, anonymization procedure, storage in the private research repository (RG-CP7).

### Lot A0 — points decided conservatively

- **What the model is shown of a tool result.** ADR-0018 § 1 says the model gets binding *names and descriptions*; ADR-0019 § 1 lists "aggregated tool results" among what is sent. **Implemented (conservative):** names, types and descriptions only, never a value. The model can still pick the right placeholders; it cannot reason about magnitudes ("your largest category is…") unless a tool exposes that as a binding itself. Revisit in A2 if answer quality needs values, and then send only what the question needs.
- **Declining.** RG-AS5 requires a stable reason code but no mechanism. **Implemented:** the orchestrator adds a `decline_request` pseudo-tool with `reason` in `WRITE_REQUEST` | `FINANCIAL_ADVICE` | `OFF_TOPIC`; a valid call yields `{ kind: 'declined', code }`. **Decided at A1:** accepted; recorded in ADR-0016.
- **Bounds not in ADR-0022 § 2.** At most 5 tool calls executed per round (the excess get `TOOL_CALL_LIMIT_EXCEEDED`), and a template of at most 600 characters (RG-AT3 gives no value). Both are constants in `assistant/`; tune from the A2 measurements. **Decided at A1:** accepted; recorded in ADR-0022 § 2.
- **`last_3_months`.** Not defined in ADR-0016. **Implemented:** the current month and the two before it, the same convention as `monthlySummary({ months: 3 })`. "The three complete months before this one" is the alternative.
- **Period bounds.** `PeriodResolver` returns `[from, to)` with an exclusive `to`, and the local calendar dates (inclusive) used for `period` bindings and sources. The existing reports disagree: `spendingByCategory` filters `occurredAt <= to`, `monthlySummary` / `cashflow` use `< to`. A1's pass-throughs must pick the right bound per report (`to - 1 ms` for `lte`). A1 must also decide what to do with `monthlyRows`, which buckets with `date_trunc('month', …)` in the database timezone rather than `users.timezone`: near a month boundary a user east or west of UTC gets a transaction in the neighbouring month, which the assistant would state confidently. **Decided at A1:** the tools adapt the bound in the tool layer (`to - 1 ms` against `lte`, the exclusive bound as is against `<`); `monthlyRows` was fixed in its own `fix(reporting)` commit, see "Lot A1" below.
- **`users.timezone` is not validated as an IANA zone.** `update-me.dto.ts` only requires a non-empty string. `PeriodResolver` throws `InvalidTimezoneError` instead of falling back to UTC. A1 should either validate on write or map the error to a stable code. **Decided at A1:** no UTC fallback for the assistant (error `USER_TIMEZONE_INVALID`), and `users.timezone` is validated as an IANA name on register and profile update.
- **Placeholder strictness.** `{{ r1.x }}` (spaces inside the braces) is rejected like any malformed placeholder, so the client renders with one exact pattern (`PLACEHOLDER_PATTERN`). A model that habitually adds spaces costs one corrective retry; relax only if the A2 violation rate shows it.
- **Cost unit.** `LLM_PRICE_*` and `AssistantUsage.estimatedCostMicros` are "millionths of a cost unit"; the unit (USD or XOF) is not fixed by ADR-0022. Decide before A1 writes the first `AssistantUsage` row. **Decided at A1:** micro-USD, with a configurable USD→XOF rate for display only.
- **`LLM_PROVIDER` defaults to `fake`.** Safe for tests and local runs, but a production instance with `ASSISTANT_ENABLED=true` and no provider would answer `LLM_UNAVAILABLE`. A1 should refuse to boot in that combination. **Decided at A1:** the API refuses to boot with `ASSISTANT_ENABLED=true` on `fake` outside `NODE_ENV=test`.
- **Synthetic user generator.** Marked **[research]** in A0: it lives in `mr-wallet-assistant-research`, not in this repository, and was not started here. A1's seeded test instance depends on it. Still open at the end of A1: see "Lot A1" below.

### Lot A1 — points decided conservatively

**Existing behavior that changed (not an assistant detail).**

- **Months in reports now follow `users.timezone`** (`fix(reporting)`, own commit, with tests on month boundaries). `monthly-summary`, `cashflow` and `comparison` used to cut months with `date_trunc` in the database session timezone, so for a user outside UTC a transaction just after local midnight on the 1st landed in the previous month. This **changes figures** on those endpoints for such users, near month boundaries, and fixes them. A stored timezone that is not an IANA name keeps these endpoints working, bucketed by UTC as before (the assistant refuses instead). Response shapes are unchanged.

**Left as they are, and visible to the assistant.**

- **Reconciliation adjustments are counted differently by two reports.** `spendingByCategory` excludes them (RG-A10) and shows `unaccountedMinor`; `cashflow` and `comparison` (via `monthlyRows`) include them in expenses. So the totals of the existing screens for the same month can differ by the adjustments. **Decided at A1.1:** for the assistant, expenses always exclude adjustments, exposed as a separate binding, through an additive option (`excludeAdjustments`, like `topTransactions`); the screens are unchanged. **Still open:** the *screens* remain inconsistent with each other. Aligning them would change existing figures and is a product decision.
- **A parent category does not include its children.** `spendingByCategory` groups by exact `categoryId`; asking for "Transport" returns only what is booked on that category, not on its subcategories. **Decided at A1.1:** an additive option `includeDescendants`, switched on by the tool only; the screens are unchanged (see "Lot A1.1").
- **`monthly_summary` is served by `cashflow`, not `monthlySummary`** (ADR-0016 note): `monthlySummary` cannot follow a symbolic period.

**Privacy lines drawn here.**

- **Budget, goal and debt names are not sent to the provider.** ADR-0019 lists category and account names only. These tools designate items by rank (and budgets by category alias); the response carries ids in each label so the client shows the real name. If answer quality needs names, extend the list in ADR-0019 deliberately; debt counterparties should stay out.
- **The model still sees no tool value.** Direction is carried by which key exists (`surplus`/`deficit`, `expense_increase`/`expense_decrease`, `remaining`/`overrun`, `balance`/`shortfall`), ranking by the order and the `top_n` keys. **Corrected at A1.1:** history turns carried the values the user was shown, which put figures in the provider request — that was a defect, not an allowance. Earlier answers now go back as templates (RG-AP9).
- **A transaction's description reaches the client, never the provider** (`top_expenses` label).
- **The answer cache holds answers in memory for 10 minutes**, keyed on a hash; that is the only place a computed answer outlives the request, per ADR-0022 § 3.

**Rules and bounds.**

- **Opt-in (RG-AP8) was kept in the browser** at A1. **Decided at A1.1:** it is a server-side timestamp (`User.assistantOptInAt`), enforced on every question; RG-AP3 and RG-AP8 are amended in ADR-0019.
- **`GET /assistant/status`** exists although the roadmap lists only `POST /assistant/ask`: the web app needs to know whether to show the entry and the questions left. It returns counters only.
- **The allowlist is an environment variable of user ids (or `*`)**, not a table. Fine for volunteers; a table would be needed for self-service.
- **Cache.** Only a question asked without history is cached (the ADR's key has no room for it); a fallback is never cached; a cache hit takes nothing from the quota. The key also carries the user's local date, so "this month" is not served across a month change. The data version reads `updatedAt` of other modules' tables through one raw query, as ADR-0022 § 3 prescribes; it includes soft-deleted rows so it only moves forward.
- **Quota day is the UTC day**, not the user's local day; an outage gives the unit back; the monthly ceiling check is strict (a cache hit is refused too) and approximate under concurrency (a few questions can overshoot, never unboundedly).
- **Throttling was per IP, not per user** at A1, although `05-api.md § 17` says "per user". **Decided at A1.1:** `/assistant` routes are counted per user (see "Lot A1.1").
- **Traces.** `LangfuseTracer` posts one `trace-create` per question to the ingestion API with `fetch`, metadata only. It has only been exercised against a stub; per-step spans can be added in A2.

**Not verifiable in this repository.**

- The exit criterion's "ten representative questions answered from the web app on the synthetic user" needs the synthetic user generator (**[research]**, private repository), a real provider, and a human in a browser. The API side is covered end to end with the scripted adapter on a real database; the web side has unit tests for rendering and a successful production build, no browser test.

### Lot A1.1 — decisions from the A1 review

**Applied as decided.**

- **History without values (blocking).** The client sends an answer back as its template; the server rejects an assistant turn with a digit outside a placeholder, reusing `validateTemplate`, with `ASSISTANT_HISTORY_INVALID` (400, `params.turn`, `params.violations`); the system prompt says earlier placeholders are no longer available. Test: no value of a previous answer is in the provider request. Recorded as RG-AP9 in ADR-0019.
- **Server-side consent.** `User.assistantOptInAt` (additive, reversible), `PUT`/`DELETE /assistant/opt-in`, `ASSISTANT_OPT_IN_REQUIRED` on `ask`. RG-AP3 and RG-AP8 amended in ADR-0019 (law 2019-014).
- **Throttle per user** on `/assistant`: a flag `@ThrottlePerUser()`; the global IP guard skips flagged routes and a second global guard, registered after `JwtAuthGuard` (so `request.user` exists), counts them by `userId`.
- **Adjustments and parent categories**: additive report options used by the assistant tools only; ADR-0016 amended.
- **Accepted as they were:** quota day in UTC (no effect in Togo); cost ceiling approximate under concurrency (bounded by the per-user throttle); the figures that moved with the timezone fix are reported as a correction (see below).

**Choices made while applying them.**

- **Numbering after the history.** New tool calls start after the highest `rN` the history mentions. Without it, `{{r1.total}}` in an earlier turn and the new `r1.total` are the same name, and a model reusing the old one would print a different figure silently.
- **Consent date.** Accepting again keeps the first date (the record is the moment of consent). Accepting is refused (`ASSISTANT_DISABLED`) where the assistant is not open; withdrawing is always possible. Both are audited with a date and nothing else.
- **Existing browser flags are ignored.** A1's `localStorage` opt-in is no longer read: a user who accepted under A1 is asked again, because the server holds no proof of that choice. A1 was never exposed beyond the allowlist.
- **"Not now"** on the opt-in screen leaves the page (to accounts); it records nothing.
- **Subcategory overlap.** With `includeDescendants`, a parent's item includes its children and each child stays listed, so the items overlap; `totalMinor` is still counted once. Consumers that rank must use top-level items (`parentId` null), as the tool does. Only one level of nesting is rolled up, like `CategoriesService.descendantIds` and RG-B2.
- **Both directions of adjustments** are left out of the assistant's income and expenses: an adjustment typed `INCOME` is no more identified income than an `EXPENSE` one is identified spending. They are bound separately, so nothing is hidden.
- **`reporting` reads the user's subcategories** through its own `PrismaService` (like it already reads `Transaction`), not through `CategoriesFacade`: one `findMany` of `id, parentId`, no new module dependency in `02-architecture.md`.
- **CHANGELOG.** `CHANGELOG.md` is generated by release-please from commit subjects. The month-boundary fix is its own `fix(reporting)` commit and will be listed under "Bug Fixes" at the next release; a hand-written entry would be duplicated or overwritten. The commit body states that figures near month boundaries change for users outside UTC.
