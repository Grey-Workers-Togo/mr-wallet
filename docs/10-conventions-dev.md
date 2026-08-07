# 10 — Development conventions

---

## 1. Language

| Element | Language |
|---|---|
| Code, identifiers, table and field names | **English** |
| Error codes, `i18nKey`, notification types | **English**, stable, never translated |
| Code comments | French or English, but consistent per file |
| Documentation, commits | **French** |
| User interface | **French and English** (ADR-0009) |
| Data entered by the user | Their language, never translated |

## 1 bis. Internationalization

Single rule, from which everything else follows (ADR-0009):

> **The database and the API never contain text intended to be read by a human.** They carry stable identifiers and parameters; rendering happens client-side.

### Translation structure

```
apps/web/messages/
├── fr.json
└── en.json
```

Hierarchical keys by domain, mirroring the modules:

```jsonc
{
  "category": { "food": "Alimentation", "housing": "Logement" },
  "error":    { "TRANSACTION_CURRENCY_MISMATCH": "La devise doit être {expected}, reçue {received}." },
  "notification": {
    "BUDGET_THRESHOLD": "Budget {budgetName} : {percentUsed} % consommé, {daysRemaining} jours restants"
  },
  "account":  { "type": { "MOBILE_MONEY": "Mobile money" } }
}
```

Messages intended for push notifications are duplicated server-side (`apps/api/messages/`), since they are rendered at the moment of sending (RG-N10).

### Rules

| Rule | Statement |
|---|---|
| RG-L1 | No string visible to the user is hardcoded in a component. Dedicated lint rule. |
| RG-L2 | **Key parity checked in CI**: `fr.json` and `en.json` must have exactly the same set of keys. A missing key fails the build; it does not silently fall back to the other language. |
| RG-L3 | A message is a **complete, parameterized sentence**, never a concatenation of fragments. Word order and agreement differ between languages. |
| RG-L4 | Pluralization goes through the ICU mechanism (`{count, plural, one {…} other {…}}`), never an `if (n > 1)`. |
| RG-L5 | Every enum exposed to the user (`AccountType`, `DebtKind`, `TxStatus`…) has one translation entry per value. Adding an enum value without its translation fails CI. |
| RG-L6 | Dates and numbers are formatted via `Intl`, with `user.locale` and `user.timezone`. Never a hand-built format. |
| RG-L7 | Formatting an amount combines `locale` (separators, symbol position) and `Currency.minorUnits` (number of decimals). The two are independent: a user in `en` can display XOF. |
| RG-L8 | Use logical CSS properties (`margin-inline-start`, `padding-inline`, `text-align: start`) rather than `left`/`right`. A free convention that limits the cost of an eventual RTL. |
| RG-L9 | Accessibility labels (`aria-label`, `alt`) are translated like everything else. |

---

## 2. Code style

- TypeScript in `strict` mode, `noUncheckedIndexedAccess` enabled.
- No `any`. Use `unknown` then validate (Zod).
- No TypeScript `enum` on the shared side: prefer literal unions or generated Prisma enums.
- Pure functions for all calculation logic (amounts, schedules, periods) — they must be testable without a database.
- Naming: `camelCase` (variables, functions), `PascalCase` (types, classes), `SCREAMING_SNAKE_CASE` (constants).
- One file = one responsibility. Beyond 300 lines, split it up.

### Forbidden

```ts
// ❌ Amount as a floating-point number
const total = 12.5 + 7.3;

// ❌ Hardcoded precision
const display = amountMinor / 100;

// ❌ Unscoped query
await prisma.transaction.findMany({ where: { accountId } });

// ❌ Business calculation date taken from createdAt
where: { createdAt: { gte: monthStart } }

// ❌ Hardcoded visible string, and concatenation of fragments
<button>Enregistrer</button>
const msg = "Budget " + name + " dépassé de " + n + " %";

// ✅ Corrections
const total = Money.add(a, b);
const display = formatMoney(amountMinor, currency);  // reads minorUnits
await prisma.transaction.findMany({ where: { userId, accountId } });
where: { userId, occurredAt: { gte: monthStart } }
<button>{t("common.save")}</button>
const msg = t("budget.exceeded", { name, percent: n });
```

---

## 3. Structure of a back-end module

```
modules/<name>/
├── <name>.module.ts          # Nest declaration, imports, exports
├── <name>.controller.ts      # HTTP only: validation, mapping, codes
├── <name>.service.ts         # business rules
├── <name>.facade.ts          # public interface consumed by other modules
├── <name>.repository.ts      # Prisma access (if query logic is non-trivial)
├── dto/
│   ├── create-<x>.dto.ts
│   └── update-<x>.dto.ts
├── domain/                  # pure functions: calculations, rules, invariants
└── __tests__/
    ├── <name>.service.spec.ts
    ├── <name>.controller.e2e-spec.ts
    └── domain/*.spec.ts
```

Rules:

- The **controller** contains no business rules.
- The **service** knows nothing about HTTP (no `Request`, no status codes).
- The **facade** is the module's only export to the outside. Whatever is not in the facade is private.
- The **domain** folder depends neither on Nest nor on Prisma. This is where schedule calculation, budget period calculation, and monetary arithmetic live.

---

## 4. Validation

- Every API input is validated by a Zod schema, before reaching the service.
- Zod schemas live in `packages/contracts` and are shared with the front end — a single source of truth for data shape.
- Business validation ("the currency must match the account") stays in the service, not in the schema.

---

## 5. Database

- One migration per functional change, explicitly named: `20260728_add_debt_installments`.
- **Every migration must be reversible.** If that's not possible, document it in the migration file.
- No `prisma db push` outside of local prototyping.
- Every new business table carries the 5 mandatory fields (`id`, `userId`, `createdAt`, `updatedAt`, `deletedAt`) and the `(userId, deletedAt)` index.
- Analytical queries go through `$queryRaw` with `Prisma.sql` (never string concatenation).
- Any operation touching money runs inside an explicit SQL transaction.

---

## 6. Tests

### Expected breakdown

| Type | Target | What is tested |
|---|---|---|
| Unit (domain) | Coverage ≥ 95% | Monetary arithmetic, schedules, budget periods, deduplication, parsing |
| Service | Coverage ≥ 80% | Business rules with a test database |
| API (e2e) | All endpoints | Return codes, validation, **multi-user isolation** |
| Front e2e | 13 MVP use cases | Complete flows |

### Mandatory, non-negotiable tests

1. **Isolation**: for each endpoint, a user A receives 404 on a resource belonging to B.
2. **Arithmetic**: no monetary test may go through a `number`.
3. **Schedule**: `Σ principal = principal` and last `balanceAfter = 0`, on at least 5 parameter sets, including a 0 rate and a non-divisible amount.
4. **Conversion**: 10.00 EUR → 6,560 XOF at the rate of 655.957.
5. **Audit**: every mutation produces exactly one entry, with the correct `before`/`after`, without any sensitive field.
6. **Reconciliation**: after a random sequence of 200 creations/modifications/deletions, the stored balance equals the recalculated balance.
7. **Idempotence**: replaying a `POST` with the same `Idempotency-Key` does not create a duplicate.

### What not to test

Trivial getters, DTO mappings without logic, framework code. Coverage is not a goal in itself; covering the `RG-xx` rules from `04-modules.md` is.

---

## 7. Git

### Branches

`main` (protected) ← `feat/<lot>-<subject>` | `fix/<subject>` | `chore/<subject>`

### Commits — Conventional Commits

```
feat(debts): génération de l'échéancier amortissable
fix(transactions): correction du solde après suppression d'un transfert
test(money): cas de répartition avec reste
docs(api): endpoints de simulation de remboursement
refactor(budgets): extraction du calcul de période dans domain/
chore(deps): mise à jour de prisma
```

One commit = one coherent change. No "wip" commits on `main`.

### Pull requests

- Description: what changes, why, how to test it.
- Reference to the lot and to the `RG-xx` rules covered.
- Green CI mandatory.

---

## 8. Definition of done (per task)

A task is only complete if **all** the points below are true:

- [ ] The code respects the prohibitions in §2.
- [ ] The relevant `RG-xx` rules are implemented and tested.
- [ ] Multi-user isolation test added for every new endpoint.
- [ ] Prisma migration created, named, reversible.
- [ ] Audit logging verified (the action appears in `AuditLog` with the correct content).
- [ ] `npm run lint && npm run typecheck && npm run test` pass.
- [ ] Documentation (`docs/03`, `docs/05`) is up to date if the model or the API changed.
- [ ] No `console.log`, no `TODO` without an associated ticket.
- [ ] No sensitive data in added logs.
- [ ] **Every visible string added exists in `fr` and in `en`**; key parity passes in CI (RG-L2).
- [ ] Every new error code, notification type, or exposed enum value has its translation in both languages.

---

## 9. Environments and configuration

| Variable | Role | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | — |
| `JWT_SECRET` | Access token signing | — (mandatory) |
| `JWT_ACCESS_TTL` | Access token lifetime | `15m` |
| `REFRESH_TTL` | Refresh token lifetime | `30d` |
| `ARGON_MEMORY_COST` | Argon2id memory cost | `19456` |
| `UPLOAD_MAX_BYTES` | Max size of an import | `10485760` |
| `UPLOAD_RETENTION_DAYS` | Retention of imported files | `30` |
| `AUDIT_RETENTION_MONTHS` | Retention of the audit log | `24` |
| `EXCHANGE_RATE_PROVIDER` | Rate provider (empty = disabled) | empty |
| `VAPID_PUBLIC_KEY` | Web Push public key (empty = push disabled) | empty |
| `VAPID_PRIVATE_KEY` | Web Push private key | empty |
| `VAPID_SUBJECT` | `mailto:` contact required by the Web Push spec | empty |
| `IP_HASH_SALT` | IP hashing salt | — (mandatory) |
| `LOG_LEVEL` | Log level | `info` |

The application refuses to start if a mandatory variable is missing — environment schema validation at boot, no silent failure in production.

---

## 10. Scheduled tasks

| Task | Frequency | Role |
|---|---|---|
| `generateBudgetPeriods` | daily | Materializes budget periods over a rolling 12 months |
| `materializeRecurrences` | daily | Creates transactions for due `autoCreate` recurrences (idempotent) |
| `notifyUpcoming` | daily | Reminders for debt and recurrence due dates |
| `markLateInstallments` | daily | Moves overdue installments to `LATE` |
| `reconcileBalances` | nightly | Compares stored and recalculated balances, notifies on discrepancies |
| `purgeUploads` | daily | Deletes imported files older than 30 days |
| `purgeAuditLog` | monthly | Archives then purges beyond the retention period |
| `purgeDeletedAccounts` | daily | Physical purge of accounts deleted more than 30 days ago |
| `purgeStaleDeviceTokens` | weekly | Deletes push subscriptions inactive or failing for 90 days |
| `purgeExpiredSupportRows` | daily | Purges expired `IdempotencyKey`, `PasswordResetToken`, and `ExportJob` |

All tasks are **idempotent** and logged with `actorType = SCHEDULER`.

---

## 11. Decision log

Every non-trivial architectural decision is recorded in `docs/adr/NNNN-title.md`:

```markdown
# ADR-0003 — Solde de compte stocké plutôt que calculé

## Statut
Accepté — 2026-07-28

## Contexte
[le problème]

## Décision
[ce qui est décidé]

## Conséquences
[bénéfices, coûts, ce que ça ferme]
```

The first six ADRs are already written (`docs/adr/0001` through `0006`) and cover the structuring decisions made during the design phase. Every new architectural decision made during implementation adds an ADR; a decision that replaces another one moves the old one to "Superseded by ADR-NNNN" status without deleting it.
