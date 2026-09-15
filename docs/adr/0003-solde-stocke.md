# ADR-0003 — Stored account balance, with reconciliation

## Status
Accepted — 2026-07-28

## Context
An account's balance can be recomputed on demand (opening balance + sum of transactions) or stored and maintained incrementally. Recomputation is always correct but becomes slow beyond a few thousand transactions, on screens that are consulted constantly. A stored balance is fast but can drift silently if a write partially fails.

## Decision
Balance stored on `Account.currentBalanceMinor`, updated in the **same SQL transaction** as any creation, modification or deletion of a transaction. A nightly task recomputes every account's balance and logs any discrepancy in `BalanceCheck`, notifying the user.

## Consequences
- **Benefit**: instant reads on every screen.
- **Cost**: a reconciliation task to maintain, and an alerting mechanism.
- **Rule**: a detected discrepancy is **never** silently corrected — it signals a bug that must be seen.
