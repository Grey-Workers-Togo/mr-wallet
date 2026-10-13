# ADR-0016 — Conversational assistant: the model selects tools, figures come from existing reports

## Status
Proposed — 2026-10-13

## Context

Users want to ask questions about their money in plain French — "how much did I spend on transport this month?", "am I within my budgets?" — instead of navigating report screens. Large language models (LLMs) make that interface possible. They also bring two failure modes that are unacceptable in this product:

1. **Hallucination.** A model can produce a fluent, confident and wrong answer. A wrong amount stated with confidence is worse than no answer, because the user acts on it.
2. **Arithmetic.** Models are unreliable at exact multi-step computation. Letting a model sum a month of transactions is right most of the time and wrong without warning the rest of the time. `01-vision-perimetre.md § 3` sets "trust the numbers" as a product goal; that alone rules it out.

Three integration patterns were considered:

| Pattern | Why it is rejected or kept |
|---|---|
| Give the model the raw transaction history and let it answer | Rejected. The model computes (failure mode 2), and the full history leaves the server (see ADR-0019). |
| Let the model write SQL (text-to-SQL) | Rejected. The model gets a query surface over a multi-tenant database. Prompt injection can turn into SQL that reads or writes other users' data. Every guard would have to be rebuilt around a free-form query language. |
| Let the model choose among a closed set of typed, read-only tools | **Kept.** The model interprets the question; existing, tested code computes the answer. |

The reports the tools need already exist. `ReportingService` computes spending by category, monthly summary, cash flow, period comparison, top transactions and budget vs actual in SQL (RG-RP1), with multi-currency consolidation and the reconciliation-adjustment exclusion (RG-A10). `packages/analytics-core`, foreseen by ADR-0012 as the pure reference implementation, does not exist yet. Building it now would mean writing a second implementation of every report before the first assistant answer — and running it server-side would mean loading transactions into memory, which RG-RP1 forbids.

## Decision

**A new `assistant` module. The model selects tools; every figure in an answer comes from an existing façade, never from the model.**

### 1. Tools map one-to-one onto existing façade methods

| Tool | Façade method |
|---|---|
| `spending_by_category` | `ReportingFacade.spendingByCategory` |
| `monthly_summary` | `ReportingFacade.monthlySummary` |
| `cashflow` | `ReportingFacade.cashflow` |
| `compare_periods` | `ReportingFacade.comparison` |
| `top_expenses` | `ReportingFacade.topTransactions` (limit ≤ 5) |
| `budget_status` | `ReportingFacade.budgetVsActual` |
| `account_balances` | `AccountsFacade` |
| `net_worth` | `ReportingFacade.netWorth` |
| `cashflow_forecast` | `ForecastingFacade` |
| `goals_progress` | `GoalsFacade` |
| `debts_summary` | `DebtsFacade` |

`ReportingFacade` currently exposes only `netWorth`. The other report methods are added to the façade as pass-throughs. This is additive: no existing endpoint or behavior changes. `ForecastingFacade` is created for the same purpose.

Two implementation notes (lot A1):

- `monthly_summary` is served by `ReportingFacade.cashflow` over the resolved period, not by `monthlySummary`: the latter only knows "the last N months counted from now" and cannot follow a symbolic period such as `last_month`. The `monthlySummary` pass-through exists for completeness.
- Budget, goal and debt names are user-entered and are **not** among the names ADR-0019 allows to leave the server (categories and accounts only). These tools designate their items by rank and, for budgets, by category alias; the client resolves the real name from the id carried in each binding's label. Debt counterparties never appear.

No tool contains business logic of its own. A tool adapts arguments and shapes the result; the computation is the façade's.

### 2. The model never produces dates or internal identifiers

- **Periods are symbolic.** A tool takes `this_month`, `last_month`, `last_3_months`, `this_year`, or an explicit month (`2026-09`). The server resolves it to UTC bounds using `users.timezone`, exactly as every other period boundary in the product is computed (`02-architecture.md § 7`).
- **Categories and accounts are aliased.** The model receives `c1: Transport`, `c2: Alimentation`, `a1: Flooz`… and answers with aliases. The server maps them back. Internal UUIDs never reach the model.

### 3. Rules

| Rule | Statement |
|---|---|
| RG-AS1 | Every tool is read-only. The assistant never creates, updates or deletes data. |
| RG-AS2 | Tool arguments are validated by a Zod schema before execution. An invalid call is returned to the model as an error, never executed. |
| RG-AS3 | The `userId` passed to a tool comes from the authenticated request, never from model output. |
| RG-AS4 | A single question triggers at most 3 rounds of tool calls (ADR-0022). |
| RG-AS5 | Requests outside the catalogue — writes, financial advice (a non-goal of `01-vision-perimetre.md § 4`), unrelated topics — are declined with a stable reason code. |

**Declining (RG-AS5).** The model refuses through a pseudo-tool of the orchestrator, `decline_request`, whose single argument `reason` is `WRITE_REQUEST`, `FINANCIAL_ADVICE` or `OFF_TOPIC`. It is not in the tool registry, so it can never run a query. A valid call ends the question with `{ kind: 'declined', code }`; the client renders the text from the code. These three codes are the stable set.
| RG-AS6 | Each tool has a multi-user isolation test: a tool run for user A never returns user B's data. |
| RG-AS7 | Every answer lists its sources: which tools ran, with which resolved period. |

### 4. Dependencies

```
assistant → llm, reporting, budgets, accounts, categories, forecasting, goals, debts
```

No existing module depends on `assistant`. The graph in `02-architecture.md § 4` is updated accordingly.

## Consequences

**Benefits**

- An answer is exactly as correct as the report screens, because it *is* the report screens' computation.
- The surface the model can reach is closed, enumerable and testable: eleven functions, all read-only, all scoped to the caller.
- No second implementation of the reports is written.

**Costs**

- Questions the catalogue does not cover cannot be answered. That is deliberate: "I can't answer that" is acceptable; a guessed figure is not. Coverage is measured on the evaluation set and the catalogue grows from observed gaps.
- Tool selection becomes the main error source. A wrong tool or a wrong period yields a correct figure for the wrong question. This is measured (tool-selection accuracy) and mitigated by symbolic periods and RG-AS7.

## Re-examination

If `packages/analytics-core` is built for the mobile client, tools may target it instead of the SQL reports without changing their contract. If tool-selection accuracy on the evaluation set stays below target with the selected model, revisit the tool granularity before revisiting the pattern.
