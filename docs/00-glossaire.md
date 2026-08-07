# 00 — Glossary

Vocabulary shared by the product, the code, and the database. **The English terms in parentheses are the names used in the code and schema.** French is used in the interface and documentation.

---

## Core entities

**Account** *(Account)* — A place where money resides: bank account, cash, mobile money, credit card, wallet. Carries a balance and a single currency.

**Transaction** *(Transaction)* — A movement of money on an account. Three possible natures:
- **Expense** *(EXPENSE)* — outgoing money.
- **Income** *(INCOME)* — incoming money.
- **Transfer** *(TRANSFER)* — movement between two of the user's accounts; does not change net worth.

**Category** *(Category)* — Business classification of a transaction (Food, Transport, Rent…). Hierarchical, two levels maximum (category → subcategory).

**Tag** *(Tag)* — Free-form label, cross-cutting across categories ("vacation 2026", "deductible"). A transaction can carry several tags.

## Time and amounts

**Business date** *(occurredAt)* — The date on which the operation actually took place. This is the date used for all calculations (budgets, reports, forecasts).

**Recording date** *(createdAt)* — The date/time at which the row was created in the system. Used for auditing, never for business calculations.

**Minor unit** *(minor unit)* — Smallest unit of a currency. 1 EUR = 100 minor units; 1 XOF = 1 minor unit (the CFA franc has no subdivision in use). All amounts are stored as integers of minor units.

**Base currency** *(base currency)* — Currency chosen by the user in which multi-account totals are consolidated (net worth, global reports).

## Budget

**Budget** *(Budget)* — Spending envelope for a category over a given period. E.g.: "Food, 150,000 XOF, monthly".

**Budget period** *(BudgetPeriod)* — Dated instance of a budget: "Food, July 2026". Consumption and alerts are calculated against it.

**Consumption** *(spent)* — Sum of the transactions attached to the budget's category over the period.

**Remaining to spend** *(remaining)* — Budget amount minus consumption. Can be negative (overrun).

**Rollover** *(rollover)* — Option that carries the unconsumed balance (or the overrun) of one period over to the next.

## Debts

**Debt** *(Debt)* — Amount owed by the user (loan, credit, informal debt) or owed to the user (receivable). The direction is carried by the `direction` field (`OWED_BY_ME` / `OWED_TO_ME`).

**Outstanding principal** *(outstandingPrincipal)* — Amount of the principal not yet repaid.

**Amortization schedule** *(AmortizationSchedule)* — List of planned installments, each broken down into a principal portion and an interest portion.

**Installment** *(Installment)* — A line of the amortization schedule: planned date, amount, principal portion, interest portion, status (planned / paid / late / partial).

## Goals and forecasts

**Savings goal** *(SavingsGoal)* — Target amount to reach by a target date, with progress tracking and attached contributions.

**Net worth** *(Net worth)* — Sum of account balances (assets) minus the outstanding principal of all debts, converted into the base currency.

**Forecast** *(Forecast)* — Projection of balance and net worth over N months, based on known recurring transactions, debt installments, and a trend on non-recurring expenses.

**Scenario** *(Scenario)* — Variant of a forecast where the user changes assumptions ("if I reduce Transport by 20%"). Not persisted in V1: computed on the fly.

## Import / export

**Import source** *(ImportSource)* — Reusable mapping configuration, associated with a given file format (e.g.: "Ecobank CSV statement"). Stores the column → field correspondence.

**Import batch** *(ImportBatch)* — One import run: the file, its metadata, the number of rows accepted / rejected / flagged as duplicate, and the timestamp. Cancellable as a whole.

**Transaction fingerprint** *(fingerprint)* — Deterministic hash computed on (account, business date, amount, normalized label), used to detect duplicates on import.

## Technical

**Module** — Back-end division unit. See `docs/02-architecture.md`.

**Facade** *(Facade)* — Public interface of a module, the only entry point authorized for other modules.

**Audit log** *(AuditLog)* — Append-only table recording who did what, when, on which entity, with what before/after.

**Soft delete** *(soft delete)* — A deleted entity is marked `deletedAt` but remains in the database; it is excluded from all reads by default.
</content>
</invoke>
