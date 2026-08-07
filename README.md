# Budget Manager

Personal finance management application: expense tracking, budgets, debts, savings goals and forecasts.

---

## In one sentence

A web application allowing an individual to centralize their accounts, import their statements (CSV/Excel), manage their budgets and debts, project their future financial situation, and export their data — all with a timestamped audit log of every action.

## Guiding principles

| Principle | What it implies |
|---|---|
| **Modularity** | The back-end is a modular monolith. Each business domain (accounts, transactions, budgets, debts…) is an isolated module, with its own entities, rules and API. |
| **No third-party connectors in V1** | Data enters via CSV/Excel import or manual entry. No dependency on external APIs (Gozem, Deliveroo, banks) that would require commercial partnerships. |
| **Full traceability** | Every user or system action is timestamped and logged in an immutable audit log. |
| **No offline-first** | Classic connected application (client/server). No synchronization engine or conflict resolution. A read-only offline **consultation** cache is planned — writing always requires the network. |
| **A single front-end, web and mobile** | Installable, responsive-first PWA rather than a native application. The API remains client-agnostic. |
| **Bilingual end to end** | French and English from the MVP onward. The database and API contain no human-readable text: only stable identifiers and parameters. |
| **Decoupled currencies** | Multi-currency conversion is a standalone module, with manually enterable rates. No subscription to a paid API is required to run the application. |
| **Monetary accuracy** | No amount is ever stored or calculated as a floating-point number. |

## Documentation

Read in this order:

| # | Document | Content |
|---|---|---|
| 00 | [Glossary](docs/00-glossaire.md) | Common business vocabulary |
| 01 | [Vision & scope](docs/01-vision-perimetre.md) | Objectives, non-objectives, personas, use cases |
| 02 | [Architecture](docs/02-architecture.md) | Stack, modular breakdown, dependency rules, events |
| 03 | [Data model](docs/03-modele-donnees.md) | Full schema, entities, relations, constraints |
| 04 | [Specs by module](docs/04-modules.md) | Detailed business rules for each module |
| 05 | [REST API](docs/05-api.md) | Endpoints, conventions, errors, pagination |
| 06 | [Import & export](docs/06-import-export.md) | CSV/Excel import pipeline, mapping, deduplication, exports |
| 07 | [Security & audit](docs/07-securite-audit.md) | Authentication, encryption, audit log, personal data |
| 08 | [Currencies](docs/08-devises.md) | Multi-currency model and exchange rate strategy |
| 09 | [Roadmap](docs/09-roadmap.md) | MVP / V2 / V3 breakdown, implementation order |
| 10 | [Dev conventions](docs/10-conventions-dev.md) | Code style, tests, folder structure, CI, definition of done |

The architecture decisions already made are recorded in [docs/adr/](docs/adr/):

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-monolithe-modulaire.md) | Modular monolith rather than microservices |
| [0002](docs/adr/0002-montants-en-unites-mineures.md) | Amounts as integers in minor units |
| [0003](docs/adr/0003-solde-stocke.md) | Stored account balance, with reconciliation |
| [0004](docs/adr/0004-abandon-offline-first.md) | Abandoning offline-first |
| [0005](docs/adr/0005-pas-de-connecteurs-tiers.md) | Ingestion by file import, not third-party connectors |
| [0006](docs/adr/0006-devises-sans-api-externe.md) | Multi-currency without dependency on a rate API |
| [0007](docs/adr/0007-strategie-mobile-pwa.md) | Mobile via installable PWA, no native application |
| [0008](docs/adr/0008-cache-lecture-seule.md) | Read-only offline consultation cache |
| [0009](docs/adr/0009-internationalisation.md) | French and English from the MVP onward, no string rendered in the database |

`CLAUDE.md` contains the instructions intended for the implementation agent.

## Stack chosen

- **Back-end**: NestJS (TypeScript), PostgreSQL 16, Prisma ORM
- **Front-end**: Next.js (App Router), TypeScript, TailwindCSS, TanStack Query — responsive-first, installable as a PWA
- **Auth**: JWT access token in memory, rotating refresh token in an `HttpOnly` cookie, Argon2id
- **Push**: Web Push API (VAPID), without a proprietary third-party service
- **Tests**: Vitest (unit), Supertest (API), Playwright (e2e)

The justifications for these choices are in [docs/02-architecture.md](docs/02-architecture.md).

## MVP functional scope

Multiple accounts · Transactions & categories · Recurring transactions · Budgets with alerts · Debts with repayment schedule · Savings goals · CSV/Excel import with deduplication · CSV/Excel export · Net worth dashboard · Cash flow forecasts · Reports & charts · Audit log.

The sequencing details are in [docs/09-roadmap.md](docs/09-roadmap.md).

## Local startup

```bash
npm install
docker compose up -d postgres
cp apps/api/.env.example apps/api/.env   # adjust JWT_SECRET / IP_HASH_SALT

# First migration (generates apps/api/prisma/migrations/):
npm run prisma:migrate -w apps/api -- --name init
# Then, once only, add the AuditLog immutability trigger:
# npm run prisma:migrate -w apps/api -- --create-only --name add_audit_log_immutability
# and paste the content of apps/api/prisma/sql/audit_log_immutable.sql into the generated migration.sql.

npm run dev:api   # NestJS on :3000
npm run dev:web   # Next.js on :3000 (adjust ports locally)
npm run test       # money kernel + unit tests
npm run lint && npm run typecheck
```
