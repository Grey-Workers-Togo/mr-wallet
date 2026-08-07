# 02 — Technical architecture

## 1. General form: modular monolith

The back-end is **a single deployment**, split into modules with strict boundaries.

Why not microservices: a single user consults their own data, volumes are low (a few thousand transactions per user), and business transactions span several domains (recording a repayment touches `debts` and `transactions` atomically). Microservices would impose distributed consistency for no gain. Strict modular decomposition nonetheless preserves the possibility of extracting a module later if needed.

```
┌─────────────────────────────────────────────────────┐
│                  Front-end (Next.js)                │
└──────────────────────────┬──────────────────────────┘
                           │ REST/JSON + JWT
┌──────────────────────────▼──────────────────────────┐
│                    API (NestJS)                     │
│  ┌───────────────────────────────────────────────┐  │
│  │ Business modules                              │  │
│  │ accounts · transactions · categories ·        │  │
│  │ budgets · debts · goals · recurrence ·        │  │
│  │ forecasting · reporting · import · export     │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ Cross-cutting modules                         │  │
│  │ auth · users · currency · audit ·             │  │
│  │ notifications · money (kernel)                │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────┘
                           │ Prisma
┌──────────────────────────▼──────────────────────────┐
│                    PostgreSQL 16                    │
└─────────────────────────────────────────────────────┘
```

## 2. Stack and rationale

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (back + front) | A single language, types shared between API and client via a `contracts` package. |
| API framework | **NestJS** | Nest's module system matches exactly the intended decomposition: dependency injection, encapsulated modules with explicit exports, global interceptors (essential for automatic auditing). |
| Database | **PostgreSQL 16** | ACID transactions (mandatory for money movements), exact `numeric`/`bigint`, triggers (to make `audit_log` append-only), `jsonb` for audit diffs, good date functions. |
| ORM | **Prisma** | Versioned, readable migrations, strongly-typed generated client. Heavy analytical queries (reports, forecasts) are done in raw SQL via `$queryRaw`, not through the ORM. |
| Front | **Next.js (App Router)** + TailwindCSS, **responsive-first and installable (PWA)** | Server rendering for consultation screens, good behavior on slow connections. A single front serves both web and mobile (ADR-0007). |
| Service worker | Workbox | Read-only offline consultation cache (ADR-0008) and web push reception. |
| Push | Web Push API (VAPID) | No proprietary third-party service required. See `04-modules.md § K`. |
| Server state (front) | **TanStack Query** | Cache, invalidation, retry — sufficient without Redux. |
| i18n | **next-intl** (ICU) | Two locales `fr` and `en` from the MVP (ADR-0009). ICU format for pluralization. |
| Charts | **Recharts** | Lightweight, sufficient for bars/lines/pie charts. |
| Auth | JWT access (15 min) + refresh (30 days, rotating, stored hashed) | See `07-securite-audit.md`. |
| Tests | Vitest + Supertest + Playwright | |
| Files | Papaparse (CSV), SheetJS/ExcelJS (XLSX) — **server-side** | Server-side parsing allows validating and logging the import. |

### Point of attention: server-side parsing

Imported files are parsed server-side, not in the browser. Reasons: consistent validation, audit logging, and the ability to replay an import. Associated constraint: limit file size (10 MB) and process the import as an asynchronous task beyond 1,000 lines.

## 3. Module decomposition

### 3.1 Business modules

| Module | Responsibility | Does not do |
|---|---|---|
| `accounts` | Accounts, balances, opening balances, archiving | Does not compute budgets |
| `transactions` | Transactions, transfers, categorization, tags, search | Does not generate recurrences |
| `categories` | Category tree, default system categories | |
| `recurrence` | Recurrence templates, materialization of upcoming occurrences, detection of recurrences in history | Does not directly create a past transaction |
| `budgets` | Budgets, budget periods, consumption, alerts, rollover | Does not read transactions directly (goes through the `transactions` facade) |
| `debts` | Debts, receivables, schedules, amortization, repayments | Does not create the payment transaction itself (emits an event) |
| `goals` | Savings goals, contributions, progress | |
| `forecasting` | Cash flow and net worth projection, scenarios | Persists nothing (on-the-fly computation + cache) |
| `reporting` | Aggregates, time series, net worth, comparisons | Contains no business rules of its own |
| `import` | Import sources, mapping, parsing, deduplication, batches | Does not write to the database directly: calls the `transactions` facade |
| `export` | CSV/XLSX generation, full export | |

### 3.2 Cross-cutting modules

| Module | Responsibility |
|---|---|
| `money` (kernel) | `Money` type, arithmetic in minor units, rounding, formatting. **No dependency.** |
| `auth` | Registration, login, tokens, sessions, PIN lock |
| `users` | Profile, preferences, reference currency, timezone |
| `currency` | Supported currencies, exchange rates, conversion |
| `audit` | Append-only log, global interceptor, consultation |
| `notifications` | Budget alerts, upcoming debt due dates, goals reached |

## 4. Module dependency rules

**Rule 1** — A module never imports another module's `Service`. It only imports its **facade** (`<module>.facade.ts`), which exposes an explicit, stable contract.

**Rule 2** — The dependency graph is acyclic. Here are the allowed dependencies:

```
money        → (none)
currency     → money
users        → (none)
auth         → users
audit        → (none)
categories   → (none)
accounts     → money, currency
transactions → money, accounts, categories
recurrence   → transactions
budgets      → transactions, categories, money, users
debts        → money, accounts, transactions
goals        → money, accounts, transactions
import       → transactions, accounts
export       → transactions, accounts, categories, tags, budgets, debts, goals
reporting    → transactions, accounts, debts, currency, budgets
forecasting  → recurrence, debts, transactions, reporting
notifications→ budgets, debts, goals, recurrence
```

Any dependency absent from this list must be added here before being coded, and verified to be acyclic.

**Rule 3** — When a dependency would create a cycle, an **event** is used instead.

Concrete example: `debts` needs an expense transaction to be created when a repayment is recorded. Since `transactions` never depends on `debts`, there is no cycle: `debts` directly calls `TransactionsFacade.createFromDebtPayment` (same pattern as `recurrence` → `transactions`), which returns the `id` of the created transaction needed for the bidirectional link `DebtPayment.transactionId` / `Transaction.debtPaymentId`. `debts` additionally emits `DebtPaidOff` (event, not a write) so that `notifications` can alert without `debts` needing to know about `notifications`.

## 5. Domain events

Synchronous internal bus (`@nestjs/event-emitter`) in V1. No external broker: volumes do not justify it, and adding a broker would make consistency harder.

| Event | Emitter | Listeners | Effect |
|---|---|---|---|
| `TransactionCreated` | transactions | budgets, goals, notifications | Recompute consumption, goal progress, alert evaluation |
| `TransactionUpdated` | transactions | budgets, goals, notifications | Same, with old and new value |
| `TransactionDeleted` | transactions | budgets, goals | Decrement |
| `BudgetThresholdCrossed` | budgets | notifications | 80% / 100% / overrun alert |
| `GoalReached` | goals | notifications | Notification |
| `ImportBatchCompleted` | import | notifications, audit | Batch summary |
| `RecurrenceDue` | recurrence | notifications | Upcoming due date reminder |
| `DebtPaidOff` | debts | notifications | Debt paid off (RG-D8) |
| `DebtInstallmentOverdue` / `DebtInstallmentDueSoon` | debts | notifications | Installment overdue / upcoming (RG-D7) |

**Transactionality constraint**: listeners that write to the database run in the same PostgreSQL transaction as the emitter. If a listener fails, the entire operation is rolled back. Do not use "fire and forget" asynchronous emission for an effect that modifies financial data.

## 6. Target tree structure

```
budget-manager/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── common/          # filters, pipes, interceptors, decorators
│   │       │   ├── audit/       # global audit interceptor
│   │       │   ├── errors/
│   │       │   └── pagination/
│   │       ├── kernel/
│   │       │   └── money/
│   │       └── modules/
│   │           ├── accounts/
│   │           │   ├── accounts.module.ts
│   │           │   ├── accounts.controller.ts
│   │           │   ├── accounts.service.ts
│   │           │   ├── accounts.facade.ts     # public interface
│   │           │   ├── dto/
│   │           │   └── __tests__/
│   │           ├── transactions/
│   │           └── ...
│   └── web/
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── features/            # mirrors the back-end modules
├── packages/
│   └── contracts/               # types shared API ↔ front
├── docs/
├── CLAUDE.md
└── README.md
```

## 7. Cross-cutting points of attention

### Balance consistency

An account's balance can be computed (sum of transactions + opening balance) or stored. **Decision: stored and maintained incrementally**, with a full recalculation procedure exposed internally and run as a nightly background task to detect any drift. On-the-fly computation becomes too slow beyond a few thousand transactions, but a stored balance silently drifts if a write partially fails — hence the mandatory reconciliation check.

### Time zones

Everything is stored in UTC. The user's timezone (`users.timezone`) is applied **only** to the computation of period boundaries (a "month of July" does not have the same UTC boundaries depending on the timezone). Never use the server's timezone.

### Idempotency

Creation endpoints accept an `Idempotency-Key` header. A key already seen returns the original response without recreating. Essential on an unstable connection, where a user might submit twice.

### Clients and compatibility

The API is client-agnostic: it uses no server session, no HTML rendering, no dependency on the origin of the request (except for the refresh cookie, restricted to a single endpoint). A native client could consume it without modification if ADR-0007 were reconsidered.

Corollary to respect from now on: **any reusable business logic lives in `packages/contracts` or in `domain/` folders, never in a React component.** This is what keeps the cost of a possible native application limited to the presentation layer.

Second corollary, of the same nature: **the API never returns human-readable text** (ADR-0009), only codes and parameters. A client in another language, or a non-web client, consumes the same contract without adaptation.

### Performance

- Mandatory indexes: `(userId, occurredAt)`, `(userId, accountId, occurredAt)`, `(userId, categoryId, occurredAt)`, `(userId, fingerprint)` on `transactions`.
- Reports and forecasts go through aggregated SQL queries, never through in-memory loading of transactions.
- Application cache (in-memory, short TTL) on forecasts, invalidated by transaction events.
</content>
