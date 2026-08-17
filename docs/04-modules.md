# 04 — Functional specifications by module

Each section describes: the module's role, its business rules, and the edge cases to handle. Numbered rules (`RG-xx`) are binding and must be covered by tests.

---

## A. Kernel `money`

No dependencies. All monetary arithmetic in the application goes through here.

```ts
type Money = { amountMinor: bigint; currency: string };
```

| Rule | Statement |
|---|---|
| RG-M1 | Any operation between two `Money` values of different currencies throws an error. Conversion must be explicit via the `currency` module. |
| RG-M2 | `add`, `subtract`, `multiply(scalar)`, `negate`, `compare`, `isZero`, `abs` operate on `bigint` only. |
| RG-M3 | Division and percentage application use **banker's rounding** (round half to even) and return the remainder, to allow distribution without losing cents. |
| RG-M4 | `allocate(money, ratios[])` distributes an amount while ensuring `Σ parts = exact amount`. Remaining minor units are distributed one by one to the first parts. |
| RG-M5 | Formatting reads `minorUnits` from the `Currency` table. Never a hardcoded `100` constant in the code. |

**Edge cases:** zero amount, negative amounts (allowed internally for balances, never on `Transaction.amountMinor`), very large amounts (the `bigint` covers well beyond real-world needs).

---

## B. Module `accounts`

### Role
Manage accounts and maintain their balance.

### Rules

| Rule | Statement |
|---|---|
| RG-A1 | An account's currency is **immutable** after creation once the account holds at least one transaction. |
| RG-A2 | The opening balance is dated (`openingBalanceAt`). Any transaction prior to this date is rejected with an explicit message. |
| RG-A3 | `currentBalanceMinor` is updated in the **same SQL transaction** as the creation/modification/deletion of a transaction. Never after the fact. |
| RG-A4 | An account cannot be deleted if it holds non-deleted transactions. The API offers archiving instead. |
| RG-A5 | Archiving an account removes it from entry selectors but preserves its history and its weight in historical reports. |
| RG-A6 | For a `CREDIT_CARD`, the balance is negative when money is owed. `creditLimitMinor` is used to display available credit, without any blocking. |
| RG-A7 | `includeInNetWorth = false` excludes the account from net worth but not from budgets or expense reports. |

### Edge cases
Deleting an old transaction (the balance must be recalculated, not merely decremented, if adjustments have occurred); account with a negative opening balance; reconciliation detecting a discrepancy (see `BalanceCheck`).

---

## C. Module `categories`

| Rule | Statement |
|---|---|
| RG-C1 | Maximum depth: 2 levels. A subcategory cannot have a child. |
| RG-C2 | A category and its parent necessarily share the same `kind`. |
| RG-C3 | An `isSystem` category can be renamed, recolored, or archived, but never deleted. |
| RG-C6 | The displayed name is `name` if set, otherwise the translation of `i18nKey` in the current language. `i18nKey` is kept after renaming, which allows reverting to the default label. |
| RG-C7 | Name uniqueness is checked on the **resolved name**, in the user's language, within the same parent. It cannot be an SQL constraint since the system label is not stored in the database. |
| RG-C8 | Renaming a system category does not change `isSystem`: it remains non-deletable. |
| RG-C4 | Deleting a category in use requires a reassignment category. The operation is atomic and logged as a single audit action with the number of transactions moved. |
| RG-C5 | A budget on a parent category encompasses the expenses of its subcategories. |

---

## D. Module `transactions`

### Rules

| Rule | Statement |
|---|---|
| RG-T1 | `amountMinor > 0` always. A zero or negative amount is rejected. |
| RG-T2 | `currency` must equal the account's currency. |
| RG-T3 | `occurredAt` cannot be earlier than `account.openingBalanceAt`, nor later than today+1 year (safeguard against date typos). |
| RG-T4 | A transfer creates exactly two lines sharing a `transferGroupId`. Modifying or deleting one acts on both. |
| RG-T5 | Transfers are excluded from: expense totals, income totals, budgets, and net worth calculation. |
| RG-T6 | `normalizedLabel` = description in lowercase, without accents, without punctuation, normalized spaces, digit sequences longer than 4 characters replaced with `#` (masks variable reference numbers). |
| RG-T7 | `fingerprint` = SHA-256 of `accountId|occurredAt(date)|type|amountMinor|normalizedLabel`. |
| RG-T8 | On creation, active `CategorizationRule` entries are evaluated in descending priority order; **the first match wins**. If the user provided a `categoryId`, no rule applies. |
| RG-T9 | Modifying a transaction emits `TransactionUpdated` with the before and after state, so that `budgets` can decrement the old period and increment the new one (case of a date or category change). |
| RG-T10 | A transaction resulting from a debt payment (`source = DEBT_PAYMENT`) cannot be deleted directly: the `DebtPayment` must be deleted, which cascades to delete the transaction. |

### Edge cases
Changing a transaction's account (impacts two balances); changing the date across a month boundary (impacts two budget periods); transaction in a currency different from the account's (rejected); deleting a single leg of a transfer (forbidden).

---

## E. Module `recurrence`

### Rules

| Rule | Statement |
|---|---|
| RG-R1 | Computing the next occurrence takes the user's timezone into account. |
| RG-R2 | Monthly recurrence on day N > number of days in the month → last day of the month. Never rolled over to the following month. |
| RG-R3 | `autoCreate = false` by default: the occurrence is projected and notified, but no transaction is created without user action. |
| RG-R4 | `autoCreate = true`: a daily job creates the day's due occurrences, marking `source = RECURRENCE`. It is **idempotent**: `lastGeneratedAt` prevents double generation if the job runs twice. |
| RG-R5 | Modifying a rule never affects transactions already created. |
| RG-R6 | An occurrence can be skipped one-off ("skip") without disabling the rule. |

### Automatic recurrence detection

Analysis of history to suggest rules: group transactions by (account, `normalizedLabel`, amount within ±10%) and detect a regular interval over at least 3 occurrences (tolerance ±3 days). The result is a **suggestion** presented to the user, never an automatic creation.

---

## F. Module `budgets`

### Rules

| Rule | Statement |
|---|---|
| RG-B1 | Period boundaries are computed in the user's timezone, taking `user.monthStartDay` into account. A `monthStartDay = 25` gives periods from the 25th to the 24th. |
| RG-B2 | A budget on a parent category counts the expenses of all its subcategories. |
| RG-B3 | Only non-deleted `EXPENSE` transactions, within the period, in the targeted category, feed `spentMinor`. Transfers and income are excluded. |
| RG-B4 | Two active budgets cannot target the same category over overlapping periods. |
| RG-B5 | `rollover = true`: `allocatedMinor(n) = amountMinor + (allocatedMinor(n-1) − spentMinor(n-1))`. The carryover can be negative (overspending carries forward). |
| RG-B6 | Alerts trigger on **crossing** a threshold, only once per period and per threshold (`lastAlertPct`). Dropping back below the threshold and crossing it again does not re-notify within the same period. |
| RG-B7 | A budget in a currency different from a transaction converts at the rate on the transaction's date (`occurredAt`), not at the current day's rate. |
| RG-B8 | Budget periods are generated in advance over a rolling 12 months by a daily job. |

### Budget templates offered at creation

- **50/30/20**: 50% needs, 30% wants, 20% savings and debt repayment. Pre-assigned distribution of system categories.
- **Zero-based**: every unit of expected income is assigned to a category; the screen displays "left to assign" and targets zero.
- **Custom**: free-form amounts per category.

These templates are only a starting point: they generate regular `Budget` records, which can be modified afterward.

---

## G. Module `debts`

The most delicate module. All the formulas below must be tested with reference value sets.

### Schedule generation

**Amortizing loan with constant installment** — installment:

```
i = annualRatePct / 100 / périodes_par_an
M = P × i / (1 − (1 + i)^(−n))      si i > 0
M = P / n                            si i = 0
```

For each installment k:

```
intérêts_k  = capital_restant_{k−1} × i
capital_k   = M − intérêts_k
capital_restant_k = capital_restant_{k−1} − capital_k
```

| Rule | Statement |
|---|---|
| RG-D1 | All calculations are done in integer minor units. Each installment is rounded to the minor unit; **the cumulative rounding gap is absorbed by the last installment**, so that `Σ capital_k = principal` exactly. |
| RG-D2 | `balanceAfterMinor` of the last installment is exactly 0. This is a mandatory test. |
| RG-D3 | A zero-rate (`RateType.ZERO`) or informal debt without a schedule remains valid: `installments` may be empty, only `outstandingPrincipalMinor` is tracked. |
| RG-D4 | An early repayment (`isExtraPayment`) is applied **entirely to principal** and triggers regeneration of the remaining schedule. The user chooses: reduce the installment amount, or reduce the duration (default: reduce the duration, more advantageous). |
| RG-D5 | Regenerating a schedule **never** modifies installments already paid. It only touches future `SCHEDULED` installments. |
| RG-D6 | A partial payment is applied first to fees, then to interest, then to principal. The installment moves to `PARTIAL`. |
| RG-D7 | A `SCHEDULED` installment whose `dueOn < today` moves to `LATE` via a daily job, and triggers a notification. |
| RG-D8 | When `outstandingPrincipalMinor` reaches 0, the debt moves to `PAID_OFF`, `closedAt` is set, and `DebtPaidOff` is notified. |
| RG-D9 | Recording a `DebtPayment` with a `linkedAccountId` emits `DebtPaymentRecorded`, which creates an `EXPENSE` transaction (or `INCOME` if `OWED_TO_ME`) on that account. Deleting the payment deletes the transaction. |
| RG-D10 | A debt of type `OWED_TO_ME` (receivable) counts as an **asset** in net worth; a debt of type `OWED_BY_ME` as a **liability**. |
| RG-D11 | A debt's duration (`termDays`) is a real day-count, not months — it accepts days, weeks, or months from the UI (converted to days client-side) or a direct due date (derived as `dueDate - startedOn`). The installment *count* derives from `termDays`; each installment's actual due date still steps real calendar periods via the existing date arithmetic. |
| RG-D12 | `scheduleMode = MANUAL` disables the amortization engine entirely: the user supplies each installment's `dueOn` and amount by hand (`rateType` must be `ZERO`, totals must sum exactly to `principalMinor`). RG-D1/RG-D2 rounding rules don't apply (no engine-computed rounding to absorb). Manual debts reject schedule regeneration and payoff simulation, and an extra payment does not reshuffle their future installments (RG-D4/RG-D5 don't apply). |

### Views to provide

- Full schedule with principal/interest breakdown per line.
- Total cost of credit: `Σ interest` over the entire duration.
- Impact of an early repayment: interest saved, new end date.
- Debt payoff strategies (V2): "avalanche" order (highest rate first) and "snowball" order (smallest balance first), with total cost comparison.

### Edge cases
Variable rate (V2: a rate history is stored and the schedule is regenerated on each change); skipped installment; debt in a foreign currency; debt without an end date; payment exceeding the remaining principal (rejection or settling the debt with the surplus flagged).

---

## H. Module `goals`

| Rule | Statement |
|---|---|
| RG-G1 | `currentMinor` = Σ of non-deleted contributions. Recalculated, never derived from a counter alone. |
| RG-G2 | If `linkedAccountId` is set, the goal can track the account balance instead of explicit contributions. The mode is a choice made at creation and cannot be changed afterward. |
| RG-G3 | Required monthly savings = `(targetMinor − currentMinor) / remaining months`, rounded up. If `targetDate` has passed and the goal is not reached, display the delay, not a negative value. |
| RG-G4 | Reaching the target moves the status to `COMPLETED` and emits `GoalReached`. A later contribution is accepted (overshoot allowed). |
| RG-G5 | A contribution can generate an actual transfer to a savings account, or remain a simple marking. The behavior is explicit at entry time. |

---

## I. Module `forecasting`

### Projection method (V1)

For each future month from M+1 to M+N (N = 6 by default, 24 max):

```
solde_projeté(m) = solde_projeté(m−1)
                 + revenus_récurrents(m)
                 − dépenses_récurrentes(m)
                 − échéances_de_dettes(m)
                 − dépenses_non_récurrentes_estimées(m)
                 + contributions_objectifs_planifiées(m)
```

`dépenses_non_récurrentes_estimées` = average of the last 3 complete months of expenses not attached to a recurrence, per category. A 6-month median is used if variance is high (standard deviation > 40% of the mean), to limit the effect of atypical months.

| Rule | Statement |
|---|---|
| RG-F1 | The projection persists nothing. Result cached (TTL 1h), invalidated by any transaction, budget, or debt event. |
| RG-F2 | Each projection point exposes its **composition** (recurring share, estimated share, debt share) so the user understands where the figure comes from. |
| RG-F3 | With less than 2 months of history, the "estimated" part is not computed; the application explicitly shows that the projection is incomplete rather than extrapolating from insufficient data. |
| RG-F4 | The projection flags months where the projected balance goes below zero (cash-flow alert). |
| RG-F5 | Projections are estimates based on history. The interface must not present them as certain predictions nor draw financial recommendations from them. |

### Scenarios (V2)
Parameters applicable without persistence: percentage change of a category, addition/removal of a hypothetical recurrence, early repayment of a debt, income change. Result: two overlaid curves (reference vs scenario) and the delta at the horizon.

---

## J. Module `reporting`

Reports to provide (all filterable by period, accounts, categories, tags):

1. **Expenses by category** — pie chart + table, with % of total and change vs previous period.
2. **Monthly trend** — income/expense bars, net balance line.
3. **Net worth over time** — curve over 12/24/60 months, broken down into assets/liabilities.
4. **Cash flow** — inflows, outflows, net, per month.
5. **Period comparison** — month vs month−1, month vs same month year−1.
6. **Top expenses** — largest transactions of the period.
7. **Budget vs actual** — variance per category.
8. **Debts** — total remaining principal, cumulative interest paid, projected debt-free date.

| Rule | Statement |
|---|---|
| RG-RP1 | All aggregates are computed in SQL, never by loading into memory. |
| RG-RP2 | Multi-currency conversion uses the rate on the date of each transaction, not the current day's rate. The report indicates the consolidation currency and the method. |
| RG-RP3 | Net worth = Σ(account balances with `includeInNetWorth`) + Σ(receivables `OWED_TO_ME`) − Σ(remaining principal owed `OWED_BY_ME`). |
| RG-RP4 | Historical net worth is rebuilt from transactions, not from a stored snapshot — otherwise any retroactive correction would distort history. |

---

## K. Module `notifications`

| Rule | Statement |
|---|---|
| RG-N1 | A notification is created only once per (type, entity, period). No duplicate if the job runs multiple times. |
| RG-N2 | Two channels in V1: **in-app** (always) and **web push** (opt-in). Email is V2. |
| RG-N3 | The user can enable or disable each channel for each notification type. |

### Web push

Push relies on the Web Push API and the `DeviceToken` table (see `03-modele-donnees.md § 17`). It complements the in-app channel, it does not replace it: a notification is **always** created in the database, push is only an immediate delivery attempt.

| Rule | Statement |
|---|---|
| RG-N4 | A push send failure never fails the business operation that triggered it. Sending is asynchronous and outside the SQL transaction. |
| RG-N5 | The content of a push contains **neither amount, nor transaction label, nor payee name**. An overspend notification says "Groceries budget exceeded", not "Groceries budget exceeded by 12,500 XOF". A push goes through a third-party service and can be displayed on a locked screen. |
| RG-N6 | An `endpoint` returning a definitive error (410 Gone, 404) is immediately disabled. A transient error increments `failureCount`; at 5, the subscription is disabled. |
| RG-N7 | The notification permission prompt is never presented on first launch, but at the moment the user creates their first budget or their first debt — that is, when interest is explicit. A premature request gets refused, and a browser refusal is hard to reverse. |
| RG-N8 | Push is **disabled by default** for all types. It is an explicit opt-in, per type. |
| RG-N9 | A notification stores `type` + `params`, **never rendered text** (ADR-0009). Rendering happens at display time, in the current language; history is therefore translated as the language changes. |
| RG-N10 | The content of a push is rendered **server-side** at send time, in the user's language (`user.locale`) — an inactive service worker cannot translate. This is the only exception to the "no server-side rendering" principle, and it stores nothing. |
| RG-N11 | A `type` unknown to the client (older version) displays a generic fallback label, never an empty line. |

**Accepted iOS limitation**: Web Push support on iOS requires the PWA to be installed on the home screen and remains more restricted than native push. No critical feature should depend on push — it remains a convenience, never the sole means of learning information. The exact state of support is to be verified when implementing lot 7.

---

## L. Module `import`

See full detail in `06-import-export.md`. Key rules:

| Rule | Statement |
|---|---|
| RG-I1 | No import writes to the database without a **preview step validated** by the user. |
| RG-I2 | Probable duplicate lines are presented separately, pre-checked as "to ignore", but the user can force the import. |
| RG-I3 | An import batch can be cancelled as a whole as long as no transaction in the batch has been manually modified. |
| RG-I4 | A line in error does not interrupt the import: it is collected in `errors` with its line number and the reason. |

---

## M. Module `export`

| Rule | Statement |
|---|---|
| RG-E1 | The full export ("all my data") produces an archive containing one file per entity, in UTF-8 CSV with BOM, plus a `manifest.json` indicating the export date, schema versions, and the number of rows per file. |
| RG-E2 | Exported amounts are provided both in minor units (exact column) and as formatted decimal value (readable column), to avoid any ambiguity. |
| RG-E3 | The export is logged in the audit (who, when, what scope). |
| RG-E4 | An export never contains `passwordHash`, tokens, or sessions. |
