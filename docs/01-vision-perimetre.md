# 01 — Vision & Scope

## 1. Problem

Individuals who want to manage their finances run into three obstacles:

1. **Data is fragmented**: multiple bank accounts, mobile money, cash, a credit card. No consolidated view.
2. **Existing tools are either too simple or too heavy**: expense-tracking apps ignore debts and net worth; personal spreadsheets become unmanageable after a few months.
3. **Debts are poorly modeled**: most applications treat a loan as a recurring expense, which prevents seeing the remaining principal owed, the total cost of interest, or the effect of an early repayment.

## 2. Value proposition

An application that answers four questions, in this order:

1. **Where does my money go?** — tracking and categorization of expenses, across all accounts.
2. **Am I sticking to my plan?** — budgets by category, overspend alerts.
3. **Where do I really stand?** — net worth = what I own minus what I owe.
4. **Where am I heading?** — cash flow forecasts and scenario simulation.

## 3. Product goals

| Goal | Success measure |
|---|---|
| Enter or import a month of transactions in under 10 minutes | Import of a 200-line statement in < 2 min, including mapping |
| Know at a glance whether the month is going off track | Dashboard readable without scrolling for the "remaining to spend" question |
| Never lose entered data | Soft delete + audit log + full export at any time |
| Trust the numbers | No rounding errors; totals reconcilable line by line |
| Exit the application without friction | Full CSV/Excel export, without loss of information |

## 4. Non-goals (explicit)

These points are **out of scope**, and this is not an oversight:

- ~~**Offline-first.**~~ **No longer a non-goal since 2026-09-03** ([ADR-0010](adr/0010-offline-first-mobile.md)): the mobile application is offline-first, including writes. The web front stays connected with a read-only consultation cache ([ADR-0008](adr/0008-cache-lecture-seule.md)).
- **Connectors to third-party services** (banks, Gozem, Deliveroo, aggregators). This access requires business partnerships, not a simple OAuth flow. Ingestion happens via file import.
- **Paid exchange rate API as a hard dependency.** See `08-devises.md`.
- **Business accounting**: no VAT, no chart of accounts, no invoicing, no regulatory bank reconciliation.
- **Investments and securities portfolio** (real-time quotes, capital gains). Conceivable in V3, out of MVP scope.
- **Automated financial advice.** The application shows figures and projections; it does not recommend investments or financial decisions.
- **Collaborative multi-user** (shared household budget). Considered for V3; the data model must make it possible without a redesign, but nothing is implemented before then.

## 5. Personas

### Persona A — "Awa", 29, employee, Cotonou

Bank account + mobile money + cash. Receives a fixed monthly salary, repays a car loan. Wants to stop ending the month overdrawn and know when her loan will be paid off.

**Key needs:** multiple accounts, monthly budget with alerts, debt repayment schedule, recurring transactions.

### Persona B — "Marc", 41, self-employed, irregular income

Income varies from month to month, multiple currencies (EUR and XOF), needs to smooth out cash flow and set aside provisions. Exports everything to his accountant once a year.

**Key needs:** cash flow forecasts, multi-currency, full export, fine-grained categorization.

### Persona C — "Fatou", 24, student

Few transactions, mainly in cash and mobile money. Goal: save for a specific project.

**Key needs:** quick manual entry, savings goal with progress tracking, simplicity.

## 6. Main use cases

| ID | Use case | Persona | Priority |
|---|---|---|---|
| UC-01 | Create accounts and enter opening balances | All | MVP |
| UC-02 | Manually enter an expense in under 15 seconds | C | MVP |
| UC-03 | Import a CSV/Excel statement and map columns | A, B | MVP |
| UC-04 | Re-import an overlapping statement without creating duplicates | A, B | MVP |
| UC-05 | Set a monthly budget per category and be alerted at 80% and 100% | A | MVP |
| UC-06 | Declare a debt with rate and term, see the generated repayment schedule | A | MVP |
| UC-07 | Record a repayment and see the remaining principal owed decrease | A | MVP |
| UC-08 | View net worth and its evolution over 12 months | All | MVP |
| UC-09 | Declare a recurring transaction and see it reflected in forecasts | A, B | MVP |
| UC-10 | View the 6-month cash flow projection | B | MVP |
| UC-11 | Create a savings goal and track its progress | C | MVP |
| UC-12 | Export all data to CSV/Excel | B | MVP |
| UC-13 | View the log of actions performed on one's account | All | MVP |
| UC-14 | Simulate "what if I reduce Transport by 20%?" | B | V2 |
| UC-15 | Manage accounts in different currencies and consolidate | B | V2 |
| UC-16 | Cancel an entire import batch | A, B | V2 |
| UC-17 | Advanced multi-criteria search on transactions | B | V2 |
| UC-18 | Enter an operation with its fee in a single entry, and see the fee in expense reports | A, C | V2 |
| UC-19 | Declare an account's actual balance and have the difference recorded as an adjustment | A, C | V2 |
| UC-20 | Be reminded when entry has stalled for several days | C | V2 |
| UC-21 | Enter an expense offline and have it synchronized on reconnection | All | Mobile |
| UC-22 | Feed a transaction from a statement or a receipt without typing it | A, C | Mobile |

## 7. Constraints

- **Primary usage context West Africa and Europe**: XOF (0 decimals) and EUR (2 decimals) must both work correctly. The code must never assume 2 decimals.
- **Sometimes slow connection**: on the web, screens must remain usable on a high-latency connection (pagination, progressive loading, no request blocking the entire display). On mobile, this is handled at the root: the application works offline (ADR-0010).
- **Fees on every operation**: in the primary market, mobile money operations carry a fee on nearly every transaction. It is modeled as a first-class expense (`04-modules.md § D`), never absorbed into a transfer.
- **Manual entry drifts**: cash and mobile money balances diverge from reality within days. Reconciliation against a declared actual balance is a core function, not a convenience (`04-modules.md § B`).
- **Personal financial data**: encryption in transit and at rest, strict per-user isolation, log minimization. See `07-securite-audit.md`.
- **A single developer/implementation agent at the outset**: favor a unified stack (TypeScript end-to-end) and a modular monolith rather than microservices.

## 8. Assumptions to validate

These points are not settled and will need to be confirmed in real-world usage:

1. Will users accept the effort of monthly manual import, or is this the main drop-off point? *(To measure: D+30 return rate.)*
2. Is the statement format available from target banks and mobile money operators usable in CSV/Excel? *(To verify on real samples before locking down the import pipeline.)* **Still open, and now blocking**: [ADR-0013](adr/0013-native-ingestion-channels.md) makes collecting real Flooz / T-Money / Moov Money and local bank samples a prerequisite to any new ingestion work. The current evidence suggests the real channels are transaction SMS and PDF, neither of which the pipeline handles.
3. Is the default categorization granularity sufficient, or do users immediately create their own categories?
</content>
