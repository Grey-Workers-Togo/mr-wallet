# Open questions

## RG-RP2 — multi-currency conversion in reports (batch 6)

RG-RP2 (docs/04-modules.md §J) requires that conversion use **the rate at the date of each transaction**. An
exact implementation assumes either a per-row SQL join against the rate history, or an in-memory load of the
transactions to convert — which conflicts with RG-RP1 ("all aggregates in SQL, never
in-memory loading").

**Implemented behavior (conservative):** totals are first aggregated in SQL by currency, then each
total per currency is converted to the consolidation currency using **the rate applicable at the report's
period end date** (or today's date for instant reports), rather than a per-transaction rate.
The report indicates the consolidation currency; the conversion method is not yet displayed on screen.

Impact: negligible for a single-currency user (the most common fixed XOF/EUR case); may introduce a
discrepancy for a multi-currency history with rates changed between two dates. To be fixed if multi-currency
users report a perceptible discrepancy.
