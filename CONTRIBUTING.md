# Contributing

## Before you start

1. Read [`docs/01-vision-perimetre.md`](docs/01-vision-perimetre.md), [`docs/02-architecture.md`](docs/02-architecture.md), [`docs/03-modele-donnees.md`](docs/03-modele-donnees.md).
2. Read [`docs/09-roadmap.md`](docs/09-roadmap.md) — implement **in lot order**, don't skip a lot.
3. Read [`docs/10-conventions-dev.md`](docs/10-conventions-dev.md) before your first commit. It is the source of truth for everything below; this file is a summary, not a replacement.

## Absolute rules

- **Never `float`/`Number` for an amount.** Every amount is an integer in minor units (`amountMinor: bigint`) with a `currency` (ISO 4217) and a `minorUnits` precision. XOF has no sub-unit (`minorUnits = 0`); never hardcode `×100`.
- Every business table carries `createdAt`, `updatedAt`, `deletedAt` (soft delete), UTC `timestamptz`. Every write goes through the global audit interceptor into `audit_log` (append-only, no ad hoc logging).
- Distinguish `occurredAt` (business date) from `createdAt` (technical date) — both mandatory on a transaction.
- One module = one folder under `apps/api/src/modules/<name>/`. A module never imports another module's service directly — go through its `*.facade.ts` or an event. See the allowed dependency graph in `docs/02-architecture.md`.
- Two locales from day one: `fr` and `en` (ADR-0009). The build fails if a key is missing in either. No human-readable text in the database or API — only stable identifiers + params, rendered client-side. No hardcoded visible string, no string concatenation for a sentence.
- No offline-first, no local sync database, no deferred write queue, no conflict resolution (ADR-0007/0008). One front end only — PWA, responsive, no native app.
- No third-party connector (bank, ride-hailing, delivery) in V1/V2 — file import or manual entry only. No paid FX-rate API in the core; rates are entered manually, an external provider is optional.
- Passwords: Argon2id, never MD5/SHA/bcrypt. Every query is scoped to the authenticated user — no Prisma query on a business table without a `userId` filter. Write a test per endpoint proving user A can't read user B's data.
- Never log an amount, transaction label, or email. Access token in memory only, never `localStorage`; refresh token in an `HttpOnly` cookie scoped to `/auth/refresh`.

When a rule is ambiguous, don't invent business behavior silently — open a question in `docs/QUESTIONS.md`, implement the most conservative behavior, and flag it in the task summary.

## Code style

- TypeScript `strict`, `noUncheckedIndexedAccess` on. No `any` — use `unknown` + Zod validation.
- No shared-side TypeScript `enum` — prefer literal unions or generated Prisma enums.
- Pure functions for all calculation logic (amounts, schedules, periods), testable without a database.
- `camelCase` for variables/functions, `PascalCase` for types/classes, `SCREAMING_SNAKE_CASE` for constants.
- One file = one responsibility. Split past ~300 lines.

## Back-end module layout

```
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts   # HTTP only, no business rules
├── <name>.service.ts      # business rules, no HTTP concerns
├── <name>.facade.ts       # the module's only export to the outside
├── <name>.repository.ts   # Prisma access, if non-trivial
├── dto/
├── domain/                # pure functions, no Nest, no Prisma
└── __tests__/
```

## Validation

Every API input is validated by a Zod schema living in `packages/contracts`, shared with the front end. Business validation stays in the service.

## Database

One migration per functional change, explicitly named and **reversible**. No `prisma db push` outside local prototyping. Every new business table carries the 5 mandatory fields (`id`, `userId`, `createdAt`, `updatedAt`, `deletedAt`) and the `(userId, deletedAt)` index. Money operations run inside an explicit SQL transaction.

## Tests

| Type | Target | What is tested |
|---|---|---|
| Unit (domain) | ≥ 95% coverage | Monetary arithmetic, schedules, budget periods, deduplication, parsing |
| Service | ≥ 80% coverage | Business rules against a test database |
| API (e2e) | All endpoints | Return codes, validation, **multi-user isolation** |
| Front e2e | 13 MVP use cases | Complete flows |

Non-negotiable: isolation test per endpoint, no monetary test through a `number`, schedule invariants (`Σ principal = principal`, final `balanceAfter = 0`), currency conversion correctness, one audit entry per mutation with correct `before`/`after`, balance reconciliation after a random sequence of writes, idempotent `POST` replay. Don't test trivial getters, DTO mappings, or framework code — coverage isn't the goal, covering the `RG-xx` rules in `docs/04-modules.md` is.

## Git

- Branches: `main` (protected) ← `feat/<lot>-<subject>` | `fix/<subject>` | `chore/<subject>`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat(debts): ...`, `fix(transactions): ...`, `test(money): ...`, `docs(api): ...`, `refactor(budgets): ...`, `chore(deps): ...`). One commit = one coherent change. No "wip" on `main`.
- Documentation and commit messages are written in **French** (`docs/10-conventions-dev.md` §1); code, identifiers, and UI strings follow the language rules in that same section.
- Pull requests: describe what changes, why, how to test it; reference the lot and the `RG-xx` rules covered; green CI mandatory.

## Definition of done

- [ ] Code respects the prohibitions above (no float money, no unscoped query, no hardcoded string, etc.).
- [ ] Relevant `RG-xx` rules implemented and tested.
- [ ] Multi-user isolation test added for every new endpoint.
- [ ] Prisma migration created, named, reversible.
- [ ] Audit logging verified.
- [ ] `npm run lint && npm run typecheck && npm run test` pass.
- [ ] Documentation (`docs/03`, `docs/05`) updated if the model or API changed.
- [ ] No `console.log`, no `TODO` without a ticket, no sensitive data in logs.
- [ ] Every new visible string exists in `fr` and `en`; key parity passes in CI.
- [ ] Every new error code, notification type, or exposed enum value is translated in both languages.

See `docs/10-conventions-dev.md` for the full rule set, environment variables, scheduled tasks, and the ADR log format.
