# 08 — Currencies and exchange rates

## 1. The problem

Reliable exchange rate APIs are paid beyond very low quotas, and free offerings are unstable (service discontinued, terms changed, quotas lowered). Making the core of the application depend on such a service creates a fragility disproportionate to the benefit.

**Decision: multi-currency works without any external API.** A rate provider is pluggable, but remains strictly optional.

---

## 2. Chosen architecture

The `currency` module exposes a single rate resolution interface, fed by several sources in cascade:

```
                    ┌─────────────────────────┐
   rate request     │  CurrencyService        │
   (from, to, date) │  .getRate()             │
                    └───────────┬─────────────┘
                                │  cascading resolution
        ┌───────────────┬───────┴────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
   1. PEGGED       2. MANUAL        3. PROVIDER        4. failure
   fixed peg       entered by       (optional,         → explicit error
   (XOF/EUR)       the user         disabled by          + request for
                                    default)              manual entry
```

### Resolution order

1. **Fixed peg** (`PEGGED`) — if the pair is an official fixed peg, it always applies and takes precedence over everything else.
2. **Manual rate** (`MANUAL`) — the most recent rate whose `validFrom ≤ requested date`, entered by the user.
3. **External provider** (`PROVIDER`) — only if a provider is configured and enabled.
4. **No rate available** — the API returns an explicit `EXCHANGE_RATE_UNAVAILABLE` error with the pair and the date. The interface prompts for the rate to be entered. **No approximate conversion is ever performed silently.**

---

## 3. Fixed pegs

Some pegs are fixed by monetary agreement and do not need to be updated:

| Pair | Rate | Basis |
|---|---|---|
| EUR → XOF | 655.957 | Fixed peg, UEMOA CFA franc |
| EUR → XAF | 655.957 | Fixed peg, CEMAC CFA franc |
| XOF → XAF | 1.0 | Identical pegs to the euro |

These rates are loaded as seed data with `source = PEGGED` and are not modifiable by the user. For a large share of the target users (CFA franc zone + Europe), **this alone covers the conversion need without any API**.

---

## 4. Manual entry

The user can enter a dated rate for any pair:

```http
POST /api/v1/currencies/rates
{ "fromCurrency": "USD", "toCurrency": "XOF", "rate": "604.25", "validFrom": "2026-07-01" }
```

- A rate is valid from `validFrom` until the `validFrom` of the next rate.
- The interface offers to enter a rate as soon as a conversion fails, with context (“USD → XOF rate as of 07/12/2026”).
- An optional monthly reminder prompts the user to update the rates in use.

This mode covers the case of a user who has a few foreign-currency transactions per year: entering 3 rates a year is cheaper than a subscription.

---

## 5. External provider (optional)

Interface to be implemented server-side, **disabled by default**:

```ts
interface ExchangeRateProvider {
  name: string;
  getRate(from: string, to: string, at: Date): Promise<Decimal | null>;
  getSupportedPairs(): Promise<string[]>;
}
```

Implementation constraints:

| Constraint | Detail |
|---|---|
| Activation | Environment variable `EXCHANGE_RATE_PROVIDER` unset = disabled. The application must work entirely without it. |
| Persistence | Every fetched rate is **written to the database** with `source = PROVIDER`. It is never called twice for the same date and the same pair. |
| Frequency | At most one call per pair and per day, triggered on demand, not as a scheduled job across all currencies. |
| Failure | A provider outage must never make a business operation fail: the system falls back to the last known rate, flagging its date. |
| Isolation | The provider only receives currency codes and dates. Never an amount, never a user identifier. |

### Subscription-free alternative

The European Central Bank publishes a feed of daily reference rates with free access. This is a realistic option for a default provider if the need arises, but it only covers currencies quoted by the ECB and is not adopted as a dependency in V1. To be evaluated when implementing the provider, checking the terms of use in force at that time.

---

## 6. Conversion rules

| Rule | Statement |
|---|---|
| RG-X1 | A transaction is **always** stored in the currency of its account. No conversion on write. |
| RG-X2 | Conversion only happens at **consolidation** time (net worth, multi-account reports, multi-currency budgets). |
| RG-X3 | The rate applied is the one in effect **on the transaction date** (`occurredAt`), not the rate of the day. Otherwise history would change retroactively with every exchange rate movement, making reports incomparable from one day to the next. |
| RG-X4 | Any converted amount is displayed with an explicit note (“converted at the rate of 07/12/2026”) and the original value remains viewable. |
| RG-X5 | Conversion calculations use `Decimal(24,12)` for the rate, then a banker's rounding to the `minorUnits` of the target currency. |
| RG-X6 | Converting and then converting back is never guaranteed to be lossless. Never store the result of a conversion as a reference value. |

### Formula

```
target_amount_minor = round(
    source_amount_minor
    × 10^(minorUnits_target − minorUnits_source)
    × rate
)
```

The `10^(Δ minorUnits)` factor is essential: converting 10 EUR (`amountMinor = 1000`, 2 decimals) to XOF (0 decimals) cannot simply multiply by the rate.

**Mandatory reference test**: 10.00 EUR → XOF at rate 655.957 must give exactly 6,560 XOF (`amountMinor = 6560`), not 655,957 nor 65.60.

---

## 7. Reference currency

`user.baseCurrency` is the consolidation currency. Changing it:

- modifies **no** transaction and no account balance;
- invalidates all cached reports;
- is logged in the audit trail;
- is flagged to the user as an operation that can change the appearance of the entire consolidated history.

---

## 8. Edge cases

| Case | Handling |
|---|---|
| Transfer between accounts in different currencies | Each leg carries its own actual amount. The effective rate is the one from the real operation, not a market rate. |
| Currency with no rate available at an old date | Explicit error, prompt to enter one. No extrapolation. |
| Currency with 3 decimals (TND, BHD, KWD) | Supported via `minorUnits = 3`. This is precisely why precision is never hard-coded. |
| Deleted or redenominated currency | Out of scope for V1. Handled via manual entry of a dated conversion rate. |
