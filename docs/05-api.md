# 05 — REST API

Base: `/api/v1`. Format: JSON. Authentication: `Authorization: Bearer <access_token>` on all endpoints, with the sole exception of `/auth/refresh`, which relies on an `HttpOnly` cookie (see `07-securite-audit.md § 2`).

---

## 1. General conventions

### Amounts

An amount is always carried as an object, never a bare number:

```json
{ "amountMinor": "125000", "currency": "XOF" }
```

`amountMinor` is a **string** in JSON (`BigInt` values exceed `Number.MAX_SAFE_INTEGER` and JSON has no arbitrary-precision integer type). The client converts it to `BigInt`.

### Dates

ISO 8601 with timezone: `2026-07-28T00:00:00+01:00`. Business dates (`occurredAt`) also accept a date-only value (`2026-07-28`), interpreted as midnight in the user's timezone.

### Naming

`camelCase` for fields, `kebab-case` for URL segments, plural for collections.

### Pagination

Cursor-based (no offset — offset drifts when rows are inserted between two pages):

```
GET /transactions?limit=50&cursor=eyJpZCI6...
```

```json
{
  "data": [ ... ],
  "pageInfo": { "hasNextPage": true, "endCursor": "eyJpZCI6..." },
  "totalCount": 1284
}
```

`totalCount` is only returned if `?withCount=true` (counting is expensive on large tables).

### Sorting and filters

```
?sort=-occurredAt,amountMinor          # - = descending
?occurredAt[gte]=2026-01-01&occurredAt[lt]=2026-02-01
?accountId=<uuid>&accountId=<uuid>     # repetition = OR
?type=EXPENSE&categoryId=<uuid>
?q=free text                           # search on description + payee
```

### Idempotency

Creation `POST` requests accept `Idempotency-Key: <uuid>`. A key replayed within 24 h returns the original response (same HTTP code, same body) without re-executing.

### Language

The API returns **no text intended for human reading** (ADR-0009). It carries stable codes and parameters; translation is done by the client.

The `Accept-Language` header is therefore only used in two cases: sending a push notification (rendered server-side, RG-N10) and transactional emails (V2). When present, it takes precedence over `user.locale` for the current request — this lets a user change language before their preference has been saved. Recognized values: `fr`, `en`. Any other value falls back to `user.locale`, then to `fr`.

### Errors

```json
{
  "error": {
    "code": "TRANSACTION_CURRENCY_MISMATCH",
    "params": { "expected": "XOF", "received": "EUR" },
    "details": [{ "field": "currency", "code": "CURRENCY_MISMATCH" }],
    "requestId": "req_01J9..."
  }
}
```

| Field | Role |
|---|---|
| `code` | Stable identifier, in English, `SCREAMING_SNAKE_CASE`. This is the contract: it does not change without an API version bump. |
| `params` | Values to interpolate into the translated message. Never a sentence, only data. |
| `details` | Per-field errors, each with its own `code`. Used for form-level display. |
| `requestId` | Correlation with `AuditLog.requestId` and application logs. |

The client holds a `code → message` dictionary per language. An unknown `code` (outdated client) displays a generic message along with the `requestId`, never an empty string nor the raw code.

> **Why no server-side `message`**: beyond i18n, an error identified by a code is testable and interpretable by a client, which a natural-language sentence is not. A server message always ends up being compared by substring somewhere.

| HTTP Code | Usage |
|---|---|
| 400 | Invalid body, business rule violated |
| 401 | Token missing, expired, or invalid |
| 403 | Resource belonging to another user (**actually returns 404**, see note) |
| 404 | Resource does not exist |
| 409 | Conflict (duplicate, overlapping budget, stale version) |
| 422 | Schema validation failed |
| 429 | Quota exceeded |
| 500 | Server error (never technical detail in the response) |

> **Security note**: a resource belonging to another user returns **404**, not 403. A 403 would confirm the identifier's existence and enable enumeration.

### Standard response headers

`X-Request-Id` (correlation with audit), `RateLimit-*`.

---

## 2. Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Registration. Body: email, password, baseCurrency, timezone. |
| POST | `/auth/login` | Returns `accessToken` (15 min) in the body. The refresh token (30 d) is set as an `HttpOnly; Secure; SameSite=Strict` cookie, scoped to `/api/v1/auth/refresh` — it never appears in the response body. |
| POST | `/auth/refresh` | Refresh token rotation. The old one is immediately revoked. The only endpoint accepting the cookie; requires an anti-CSRF header. |
| POST | `/auth/logout` | Revokes the current session. |
| POST | `/auth/logout-all` | Revokes all sessions. |
| GET | `/auth/sessions` | List of active sessions (device, last used). |
| DELETE | `/auth/sessions/:id` | Revokes a specific session. |
| POST | `/auth/password/forgot` | Sends a reset link. Response is always 204, even if the email doesn't exist. |
| POST | `/auth/password/reset` | Reset via token. Revokes all sessions. |
| POST | `/auth/password/change` | Change with current password. |

---

## 3. User

| Method | Path | Description |
|---|---|---|
| GET | `/me` | Profile and preferences |
| PATCH | `/me` | Modify displayName, locale, timezone, weekStartsOn, monthStartDay |
| PATCH | `/me/base-currency` | Change the reference currency (heavy operation: recomputes cached reports) |
| DELETE | `/me` | Account deletion (soft delete + scheduled purge at D+30) |
| GET | `/me/export` | Triggers a full export |

---

## 4. Accounts

| Method | Path | Description |
|---|---|---|
| GET | `/accounts` | List. `?includeArchived=true` |
| POST | `/accounts` | Creation |
| GET | `/accounts/:id` | Detail with current balance |
| PATCH | `/accounts/:id` | Modification (currency change refused if transactions exist) |
| DELETE | `/accounts/:id` | Soft delete, refused if transactions exist |
| POST | `/accounts/:id/archive` | Archiving |
| POST | `/accounts/:id/unarchive` | Unarchiving |
| GET | `/accounts/:id/balance-history` | Balance time series. `?from&to&granularity=day\|week\|month` |
| POST | `/accounts/:id/reconcile` | Compares stored balance and computed balance, returns the discrepancy |

---

## 5. Categories and tags

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | Full tree. `?kind=EXPENSE`. Each node returns `i18nKey` **and** `name`; the client resolves the display (RG-C6) |
| POST | `/categories` | Creation |
| PATCH | `/categories/:id` | Modification |
| DELETE | `/categories/:id?reassignTo=<uuid>` | Deletion with mandatory reassignment if in use |
| POST | `/categories/reorder` | Bulk reordering |
| GET / POST | `/tags` | List / creation |
| PATCH / DELETE | `/tags/:id` | Modification / deletion |

---

## 6. Transactions

| Method | Path | Description |
|---|---|---|
| GET | `/transactions` | Paginated, filtered list (see § filters) |
| POST | `/transactions` | Creation of an expense or income |
| POST | `/transactions/transfer` | Creation of a transfer (creates both legs) |
| GET | `/transactions/:id` | Detail |
| PATCH | `/transactions/:id` | Modification |
| DELETE | `/transactions/:id` | Soft delete |
| POST | `/transactions/bulk` | Bulk creation (max 500) |
| PATCH | `/transactions/bulk` | Bulk modification (recategorization, adding tags) |
| DELETE | `/transactions/bulk` | Bulk deletion |
| GET | `/transactions/search` | Advanced search (complex filter body as query or POST) |
| GET | `/transactions/summary` | Aggregates on the current filter: total, average, count, by category |

### Example — creation

```http
POST /api/v1/transactions
Idempotency-Key: 9f1c...

{
  "accountId": "acc_...",
  "type": "EXPENSE",
  "amountMinor": "12500",
  "currency": "XOF",
  "occurredAt": "2026-07-28",
  "description": "Taxi aéroport",
  "categoryId": "cat_...",
  "payee": "Gozem",
  "tagIds": ["tag_..."],
  "notes": null
}
```

### Example — transfer

```http
POST /api/v1/transactions/transfer

{
  "fromAccountId": "acc_bank",
  "toAccountId": "acc_savings",
  "amountMinor": "50000",
  "currency": "XOF",
  "occurredAt": "2026-07-28",
  "description": "Épargne mensuelle"
}
```

Different currencies: add `toAmountMinor` and `toCurrency`.

---

## 7. Recurrences

| Method | Path | Description |
|---|---|---|
| GET / POST | `/recurrences` | List / creation |
| GET / PATCH / DELETE | `/recurrences/:id` | Detail / modification / deletion |
| GET | `/recurrences/:id/occurrences?until=` | Projected occurrences |
| POST | `/recurrences/:id/skip` | Skip the next occurrence. Body: `{ "occurrenceDate": "..." }` |
| POST | `/recurrences/:id/materialize` | Create the pending occurrence's transaction now |
| GET | `/recurrences/suggestions` | Recurrences detected in the history, not yet created |
| GET | `/recurrences/upcoming?days=30` | All upcoming due dates, across all types |

---

## 8. Budgets

| Method | Path | Description |
|---|---|---|
| GET / POST | `/budgets` | List / creation |
| GET / PATCH / DELETE | `/budgets/:id` | Detail / modification / deletion |
| GET | `/budgets/current` | Current period of all budgets, with consumption and remainder |
| GET | `/budgets/:id/periods` | Period history |
| GET | `/budgets/:id/periods/:periodId` | Detail of a period with its constituent transactions |
| POST | `/budgets/from-template` | Creation from a template. Body: `{ "template": "FIFTY_THIRTY_TWENTY", "monthlyIncomeMinor": "..." }` |

Sample response for `/budgets/current`:

```json
{
  "data": [{
    "budgetId": "bdg_...",
    "name": "Alimentation",
    "categoryId": "cat_...",
    "periodStart": "2026-07-01T00:00:00+01:00",
    "periodEnd": "2026-07-31T23:59:59+01:00",
    "allocatedMinor": "150000",
    "rolloverInMinor": "-8000",
    "spentMinor": "97500",
    "remainingMinor": "52500",
    "percentUsed": 65,
    "currency": "XOF",
    "daysRemaining": 4,
    "projectedEndMinor": "121875",
    "status": "ON_TRACK"
  }]
}
```

`status` ∈ `ON_TRACK` | `AT_RISK` (spending pace leading to overrun) | `EXCEEDED`.

---

## 9. Debts

| Method | Path | Description |
|---|---|---|
| GET / POST | `/debts` | List / creation |
| GET / PATCH / DELETE | `/debts/:id` | Detail / modification / deletion |
| GET | `/debts/:id/schedule` | Full repayment schedule |
| POST | `/debts/:id/schedule/regenerate` | Regenerates future installments |
| GET | `/debts/:id/payments` | Payment history |
| POST | `/debts/:id/payments` | Record a payment |
| DELETE | `/debts/:id/payments/:paymentId` | Cancel a payment (deletes the linked transaction) |
| POST | `/debts/:id/simulate-payoff` | Simulates an early repayment. Body: `{ "extraAmountMinor": "...", "strategy": "REDUCE_TERM" \| "REDUCE_INSTALLMENT" }` |
| GET | `/debts/summary` | Total principal owed, cumulative interest paid, next due date, debt-free date |
| GET | `/debts/payoff-strategies` | (V2) Avalanche vs. snowball comparison |

Sample response for `simulate-payoff`:

```json
{
  "currentPayoffDate": "2029-03-15",
  "newPayoffDate": "2028-08-15",
  "monthsSaved": 7,
  "interestSavedMinor": "184300",
  "newInstallmentMinor": "125000",
  "currency": "XOF"
}
```

---

## 10. Goals

| Method | Path | Description |
|---|---|---|
| GET / POST | `/goals` | List / creation |
| GET / PATCH / DELETE | `/goals/:id` | Detail / modification / deletion |
| POST | `/goals/:id/contributions` | Add a contribution |
| DELETE | `/goals/:id/contributions/:contributionId` | Remove a contribution |
| GET | `/goals/:id/progress` | Progress, required monthly savings, projected completion |

---

## 11. Forecasts

| Method | Path | Description |
|---|---|---|
| GET | `/forecast/cashflow?months=6` | Monthly cash flow projection |
| GET | `/forecast/net-worth?months=12` | Net worth projection |
| POST | `/forecast/scenario` | (V2) Projection under assumptions |

```json
// POST /forecast/scenario
{
  "months": 12,
  "adjustments": [
    { "type": "CATEGORY_CHANGE", "categoryId": "cat_transport", "percentChange": -20 },
    { "type": "EXTRA_DEBT_PAYMENT", "debtId": "debt_auto", "amountMinor": "500000", "atMonth": 2 },
    { "type": "INCOME_CHANGE", "amountMinor": "50000", "fromMonth": 3 }
  ]
}
```

---

## 12. Reports

| Method | Path | Description |
|---|---|---|
| GET | `/reports/spending-by-category` | `?from&to&accountId&depth=1\|2` |
| GET | `/reports/monthly-summary` | `?months=12` — income, expenses, net per month |
| GET | `/reports/net-worth` | `?from&to&granularity=month` |
| GET | `/reports/cashflow` | Inflows/outflows/net |
| GET | `/reports/comparison` | `?periodA=2026-07&periodB=2026-06` |
| GET | `/reports/top-transactions` | `?from&to&limit=10` |
| GET | `/reports/budget-vs-actual` | `?period=2026-07` |
| GET | `/reports/dashboard` | Single aggregate for the home screen (avoids 8 requests) |

---

## 13. Import

| Method | Path | Description |
|---|---|---|
| GET / POST | `/import/sources` | Mapping configurations |
| PATCH / DELETE | `/import/sources/:id` | |
| POST | `/import/upload` | `multipart/form-data`. Returns `batchId` + preview of the first 20 raw rows and detected columns |
| POST | `/import/batches/:id/mapping` | Submit the columns → fields mapping |
| GET | `/import/batches/:id/preview` | Parsed, categorized rows, with duplicate flagging |
| POST | `/import/batches/:id/commit` | Validates the import. Body: rows to exclude, manual corrections |
| GET | `/import/batches` | Batch history |
| GET | `/import/batches/:id` | Detail, including per-row errors |
| POST | `/import/batches/:id/revert` | Cancels the entire batch |

---

## 14. Export

| Method | Path | Description |
|---|---|---|
| POST | `/export/transactions` | `{ format: "CSV"\|"XLSX", filters: {...} }` → file |
| POST | `/export/full` | Complete archive of all entities |
| GET | `/export/jobs/:id` | Status of an asynchronous export (beyond 10,000 rows) |

---

## 15. Currencies

| Method | Path | Description |
|---|---|---|
| GET | `/currencies` | Supported currencies with `minorUnits` |
| GET | `/currencies/rates?from&to&at=` | Rate applicable on a given date |
| POST | `/currencies/rates` | Manual entry of a rate |
| DELETE | `/currencies/rates/:id` | |
| POST | `/currencies/convert` | `{ amountMinor, from, to, at }` |

---

## 16. Notifications and audit

| Method | Path | Description |
|---|---|---|
| GET | `/notifications?unreadOnly=true` | List. Returns `type` + `params`, never rendered text (RG-N9) |
| POST | `/notifications/:id/read` | Mark as read |
| POST | `/notifications/read-all` | Mark all as read |
| GET | `/notifications/preferences` | Preferences by type and channel |
| PATCH | `/notifications/preferences` | |
| GET | `/notifications/push/public-key` | VAPID public key, needed for browser subscription |
| POST | `/notifications/push/subscribe` | Registers a push subscription |
| DELETE | `/notifications/push/subscribe` | Unsubscribes the current device |
| GET | `/notifications/push/devices` | Subscribed devices (label, last activity) |
| DELETE | `/notifications/push/devices/:id` | Revokes a device |
| POST | `/notifications/push/test` | Sends a test notification to the current device |

```http
POST /api/v1/notifications/push/subscribe

{
  "platform": "WEB_PUSH",
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": { "p256dh": "BN...", "auth": "k9..." },
  "deviceLabel": "Chrome sur Android"
}
```

An `endpoint` already registered is updated (`lastSeenAt`, `failureCount = 0`) rather than duplicated.
| GET | `/audit-log` | User's log. `?entityType&entityId&action&from&to` |
| GET | `/audit-log/:entityType/:entityId` | Full history of an entity |

The audit log is **read-only**: no write or delete endpoint is exposed.

---

## 17. Rate limiting

| Scope | Limit |
|---|---|
| `/auth/login`, `/auth/password/*` | 5 requests / 15 min / IP |
| `/import/upload` | 20 / hour / user |
| `/export/*` | 10 / hour / user |
| Rest of the API | 300 / min / user |
