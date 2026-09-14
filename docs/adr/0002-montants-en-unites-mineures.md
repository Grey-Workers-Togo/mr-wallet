# ADR-0002 — Amounts as integers in minor units

## Status
Accepted — 2026-07-28

## Context
Floating-point numbers introduce rounding errors that are unacceptable on financial data. Furthermore, the target currencies do not all have two decimals: XOF has zero, some currencies have three.

## Decision
Every amount is an integer (`BigInt`) expressed in minor units, accompanied by an ISO 4217 currency code. Precision (`minorUnits`) is carried by the `Currency` table and read at formatting time. A dependency-free `money` kernel centralizes all arithmetic.

## Consequences
- **Benefit**: guaranteed exactness, native support for 0- and 3-decimal currencies, exact SQL aggregations.
- **Cost**: `BigInt` is not JSON-serializable — amounts travel as strings in the API. The front end must convert explicitly.
- **Forbidden**: any `100` constant in the code, any `Number` applied to an amount.
