# ADR-0006 — Multi-currency without depending on a rate API

## Status
Accepted — 2026-07-28

## Context
Reliable exchange rate APIs are paid beyond very low quotas, and free offerings change or disappear. Making multi-currency consolidation depend on such a service creates a disproportionate fragility.

## Decision
The `currency` module resolves rates in cascade: fixed pegs (XOF/XAF ↔ EUR, loaded as seed data), then rates entered manually by the user, then an external provider that is **optional and disabled by default**. If no rate is available, the API returns an explicit error prompting for manual entry — never a silent approximate conversion.

## Consequences
- **Benefit**: the application works entirely without a subscription. For users in the CFA franc zone who also work in euros, the fixed pegs cover the need completely.
- **Cost**: a user with currencies outside a fixed peg has to enter their rates. Acceptable for a few transactions a year; to be reassessed if multi-currency becomes a central use.
- **Associated rule**: conversion applies the rate at the transaction's date, never the current day's rate, so that consolidated history stays stable.
