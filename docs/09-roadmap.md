# 09 — Roadmap and implementation order

Lots are **sequential**. Each one ends with a functional, tested version. Do not start a lot until the previous one is complete per the definition of done (`10-conventions-dev.md`).

Estimates are indicative, for one full-time developer.

---

## Lot 0 — Foundations (≈ 1 week)

Nothing functional yet, but everything else depends on it.

- Monorepo (`apps/api`, `apps/web`, `packages/contracts`), strict TypeScript, ESLint, Prettier.
- NestJS + Prisma + PostgreSQL locally (Docker Compose).
- **`money` kernel** with its complete test suite. This is the first code written for the project.
- Global exception filter, normalized error format (`code` + `params`, no message), `requestId`.
- **i18n foundation**: `next-intl`, `fr.json` and `en.json` files, key-parity check in CI. To be put in place now: starting with a single language always lets hardcoded strings slip through.
- Prisma middleware: soft delete + `userId` filtering.
- Global audit interceptor + `AuditLog` table + immutability triggers.
- CI: lint, typecheck, tests, migration.

**Exit criterion**: a test entity can be created via the API, produces an audit entry within the same SQL transaction, and is invisible after soft delete. The build fails if a translation key is missing in either language.

---

## Lot 1 — Identity and accounts (≈ 1 week)

- `auth`: registration, login, rotating refresh, sessions, forgotten password.
- `users`: profile, preferences, reference currency, timezone.
- `currency`: `Currency` table, fixed parities in seed, manual rate entry, conversion.
- `accounts`: CRUD, opening balance, archiving.
- Frontend: authentication screens, account list and creation.

**Exit criterion**: a user signs up, creates three accounts of different types and currencies, and sees their opening balances. A/B isolation test passing on all endpoints.

---

## Lot 2 — Transactions (≈ 1.5 weeks)

Core of the product.

- `categories`: tree, system categories in seed, reassignment on deletion.
- `tags`.
- `transactions`: CRUD, two-leg transfers, `normalizedLabel`, `fingerprint`, incremental balance maintenance.
- Cursor-paginated list, filters, text search.
- Batch operations.
- `BalanceCheck` + nightly reconciliation job.
- Frontend: quick entry (target < 15 s), list, filters, editing.

**Exit criterion**: 500 manually entered and imported transactions leave balances exact after reconciliation. Deletion and modification recalculate correctly.

---

## Lot 3 — Import and export (≈ 1.5 weeks)

- `import`: upload, sniffing, assisted mapping, reusable `ImportSource`, error-tolerant parsing, three-level deduplication, preview, transactional commit, batch cancellation.
- `CategorizationRule`: CRUD and application on import and on entry.
- `export`: targeted CSV and XLSX, full export with manifest.
- Frontend: 4-step import wizard, three-tab preview screen.

**Exit criterion**: the same statement imported twice creates no duplicates; a file with 10% malformed lines imports while isolating the errors; cancelling a batch restores exact balances.

> This is the riskiest lot in the project. Test it with **real** statements (bank, mobile money) before considering it done — real-world formats are always messier than synthetic test datasets.

---

## Lot 4 — Budgets and recurrences (≈ 1.5 weeks)

- `recurrence`: rules, occurrence calculation, materialization, skip, suggestion detection.
- `budgets`: budgets, materialized periods, incremental consumption, rollover, alert thresholds, 50/30/20 and zero-based models.
- `notifications`: in-app notifications, preferences by type and channel, `DeviceToken` table and web push sending (VAPID).
- Frontend: budgets screen with gauges, recurrences screen, notification center, contextual push permission request (RG-N7).

**Exit criterion**: a monthly budget with rollover behaves correctly over 3 simulated periods, including in case of overspending. A change to a transaction's date correctly moves consumption from one period to another.

---

## Lot 5 — Debts (≈ 1.5 weeks)

- `debts`: CRUD, amortization schedule generation, payments, partial payments, early repayment with regeneration, transition to overdue, closure.
- `DebtPaymentRecorded` event creating the linked transaction.
- Early repayment simulation.
- Frontend: debt detail with schedule, payment entry, simulator.

**Exit criterion**: on a reference loan (known amount, rate, term), the generated schedule matches an independent control calculation to the cent, and the last line leaves an outstanding principal strictly equal to 0.

---

## Lot 6 — Goals, reports, forecasts (≈ 1.5 weeks)

- `goals`: goals, contributions, progress, required savings.
- `reporting`: the 8 reports listed in `04-modules.md § J`, all in aggregated SQL.
- `forecasting`: cash flow and net worth projection over 6 to 24 months, with breakdown.
- Frontend: dashboard, report screens with charts, forecast screen.

**Exit criterion**: the calculated net worth matches the manually verifiable sum of accounts and debts; reports stay under 500 ms on a dataset of 10,000 transactions.

---

## Lot 7 — MVP finishing (≈ 1 week)

- Audit log viewing (per-entity timeline).
- Client-side PIN lock (RG-S6 to RG-S9).
- **PWA**: manifest, icons, installability, service worker.
- **Read-only offline consultation cache** (ADR-0008): bounded scope, freshness banner, writes disabled, purge on disconnect.
- Verification of actual Web Push support on iOS and documented fallback.
- Complete preferences screen, including the language selector.
- **Full i18n review**: complete walkthrough of the application in `en`, hunt for forgotten strings, verification of plurals and of date and amount formats in both languages.
- Accessibility (keyboard navigation, contrast, ARIA labels, touch targets ≥ 44 px).
- Behavior on slow connections: loading states, network error handling, retry.
- Minimal user documentation.
- Playwright e2e tests on the 13 MVP use cases, **including one mobile flow and one offline flow**.

**End of MVP.**

---

## V2 — After usage feedback (≈ 4 to 6 weeks)

In descending order of priority:

1. **Advanced search** multi-criteria, savable (UC-17).
2. **Forecast scenarios** (UC-14) — the "what if" simulator.
3. **Debt payoff strategies**: avalanche vs. snowball with quantified comparison.
4. **Email notifications**.
5. **Advanced multi-currency**: optional rate provider, detailed consolidation reports.
6. **Attachments**: receipt photo attached to a transaction.
7. **OFX/QIF import**.
8. **Mobile application** (React Native or installable PWA) — decision to be made based on feedback.
9. **Customizable dashboard** (movable widgets).
10. **From-scratch budget builder**: enter a period's total income, allocate it across categories
    with a live running remainder, create the resulting budgets in one step.

---

## V3 — Structural extensions

To be considered only with a real user base:

1. **Shared / household budget**: several users on a shared space, with roles and permissions. Structural: to be anticipated in the model (a `spaceId` in addition to `userId`) without implementing it beforehand.
2. **Investments**: securities accounts, valuation, capital gains.
3. **Bank connectors**: only via a regulated aggregator, and only if the user volume justifies the cost and associated compliance.
4. **Public API** for third-party integrations.
5. **Advanced analytics**: spending anomaly detection, comparison to anonymized averages.

---

## What remains explicitly out of scope

Offline-first · direct connectors to Gozem/Deliveroo/delivery apps (require a business partnership, not a technical integration) · business accounting · investment advice · hard dependency on a paid exchange-rate API.

---

## Verification milestones

| Milestone | Verification |
|---|---|
| End of lot 0 | Audit written within the business transaction, soft delete effective |
| End of lot 2 | Exact balance reconciliation on 500 transactions |
| End of lot 3 | Import of real bank and mobile money statements |
| End of lot 5 | Schedule validated against an independent calculation |
| End of lot 7 | 13 MVP use cases covered in e2e |
</content>
</invoke>
