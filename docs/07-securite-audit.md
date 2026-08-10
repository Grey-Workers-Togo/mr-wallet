# 07 — Security, audit, and timestamping

---

## 1. Threat model (summary)

| Threat | Severity | Mitigation |
|---|---|---|
| Access to another user's data (IDOR) | Critical | Systematic `userId` filtering + isolation tests per endpoint |
| Database theft | Critical | Encryption at rest, Argon2id hashing, no secrets in the database |
| Token theft | High | Short-lived access token, rotating refresh, session revocation |
| Leakage via logs | High | Prohibition on writing amounts, labels, and emails to logs |
| Brute force on login | Medium | Rate limiting + temporary lockout |
| SQL injection | Medium | Parameterized Prisma; `$queryRaw` only with `Prisma.sql` |
| Malicious file import | Medium | Size limit, sandboxed parsing, no Excel formula evaluation |
| XSS via transaction label | Medium | Systematic escaping on render, never `dangerouslySetInnerHTML` |
| CSV injection on export | Low | Prefix with an apostrophe any cell starting with `= + - @` |

---

## 2. Authentication

- **Hashing**: Argon2id, `memoryCost ≥ 19 MiB`, `timeCost ≥ 2`, `parallelism = 1`. Never MD5, SHA-*, or bcrypt.
- **Password policy**: 12 characters minimum, checked against a list of compromised passwords (zxcvbn or a local HIBP list). No arbitrary composition requirement (uppercase/digit/symbol), which degrades real password quality.
- **Access token**: JWT, 15 minutes, contains `sub`, `sessionId`, `iat`, `exp`. No personal data in the payload.
- **Refresh token**: opaque (256-bit random), 30 days, **stored hashed** in the database, **rotating**. Reuse detection: if an already-consumed refresh token is presented, revoke the entire session family and notify the user — a likely signal of theft.
- **Lockout**: after 5 failures, exponential delay (1 s, 2 s, 4 s…) capped at 15 minutes, per (email, IP) pair.
- **Password reset**: single-use token, 30 minutes, invalidated after use. The response of `/auth/password/forgot` is always 204, regardless of whether the email exists (no account enumeration).

### Client-side token storage

Token theft is the most likely threat on a client, and the storage location determines the exposure. The rules differ depending on the execution context.

| Context | Access token | Refresh token |
|---|---|---|
| **Web / PWA** | In memory only (JavaScript variable). Never `localStorage`. | `HttpOnly` + `Secure` + `SameSite=Strict` cookie, scoped to `/api/v1/auth/refresh` |
| **Native client** (if ADR-0007 is reconsidered) | In memory | Keychain (iOS) / Keystore (Android), never in application preferences |

| Rule | Statement |
|---|---|
| RG-S1 | The refresh token is **never** accessible to the page's JavaScript. An `HttpOnly` cookie neutralizes theft via XSS, unlike `localStorage`. |
| RG-S2 | The access token lives in memory and disappears on reload. It is re-obtained via a refresh call on startup. The cost is one extra network call; the benefit is that no token persists on disk on the web. |
| RG-S3 | Since the refresh cookie is `SameSite=Strict`, the `/auth/refresh` endpoint is the only one that accepts it, and it requires an anti-CSRF header. All other endpoints only accept `Authorization: Bearer`. |
| RG-S4 | On logout: server-side session revocation, cookie deletion, offline cache purge (RG-OF3), revocation of the device's `DeviceToken`s. |
| RG-S5 | No token, in any form, is written to the service worker cache. |

### Application lock (PIN)

Lockout after inactivity (default 5 minutes, configurable, can be disabled). The PIN is a **local** protection against physical access to the device: it does not replace server-side authentication and **is never transmitted to the API**.

| Rule | Statement |
|---|---|
| RG-S6 | The PIN is stored hashed (Argon2id, lightweight parameters suited to the client) in local storage, never in plaintext, never sent to the server. |
| RG-S7 | The lock hides the interface **and** blocks access to offline cache data. A lock that leaves data readable by another means protects nothing. |
| RG-S8 | After 5 incorrect PIN attempts, the client purges the local cache and forces a full reconnection. |
| RG-S9 | System biometrics is not guaranteed to be available on a PWA (see ADR-0007). The PIN is the reference mechanism; biometrics, when the `WebAuthn` API is available, is offered as an optional complement. |

---

## 3. Authorization

A single rule, but absolute:

> **Every request on a business table is filtered by the `userId` from the token, never from a request parameter.**

Implementation:

1. A `@CurrentUser()` decorator provides the identifier.
2. A Prisma extension automatically injects `where: { userId }` on business models, with an explicit escape hatch (`prisma.$unsafeGlobal`) reserved for system tasks and audited.
3. **Mandatory test for each endpoint**: user A gets a 404 on a resource belonging to B. This test is part of the definition of done.

A resource belonging to another user returns **404**, never 403.

---

## 4. Encryption

| Data | Protection |
|---|---|
| In transit | TLS 1.3 mandatory, HSTS, no HTTP fallback |
| Database | Encryption at rest at the volume level (provided by the host) |
| Backups | Encrypted, keys distinct from production ones |
| Imported files | Stored encrypted, purged after 30 days |
| Application secrets | Environment variables or a secrets manager, never in the repository |

Field-by-field application-level encryption of amounts is **not** adopted: it would prevent any SQL aggregation, and therefore all reports, for a marginal gain against volume encryption. Decision to be reconsidered only if a regulatory constraint requires it.

---

## 5. Application logging

Prohibited in logs, regardless of level:

- amounts, transaction labels, beneficiary names;
- email addresses, passwords, tokens, `Authorization` headers;
- IP addresses in cleartext (hashed with an application-level salt).

Allowed: technical identifiers (UUID), error codes, durations, `requestId`, endpoint names.

Every request carries a `requestId` (ULID) propagated in the logs and in `AuditLog.requestId`, which allows linking an audit entry to its technical trace without storing sensitive data.

---

## 6. Timestamping — general rules

Timestamping of all actions is a structuring requirement of the project. It is broken down into three levels.

### Level 1 — Record timestamping

Every business table carries `createdAt`, `updatedAt`, `deletedAt`, in `timestamptz`, **stored in UTC**.

- Conversion to local time is done at display time, based on `user.timezone`.
- Never use the server's timezone for a business calculation.
- `createdAt` is **immutable**: no endpoint allows modifying it.

### Level 2 — Business date / technical date distinction

| Field | Meaning | Used for |
|---|---|---|
| `occurredAt` | When the operation took place | Budgets, reports, forecasts, historical balances |
| `createdAt` | When the row was recorded | Audit, entry sorting, anomaly detection |

An expense from July 3 entered on July 28 counts toward July's budget (via `occurredAt`), and appears in the journal as created on the 28th (via `createdAt`). Conflating the two skews all reports.

### Level 3 — Audit log

See the following section.

---

## 7. Audit log

### Principle

Every action that modifies data produces an entry in `AuditLog`. The table is **append-only**, guaranteed by a PostgreSQL trigger (see `03-modele-donnees.md § 14`).

### Implementation

A **global NestJS interceptor** captures mutations. No `auditService.log(...)` scattered across services: that would be forgotten somewhere.

```
Request → Auth Guard → Audit interceptor (opens the context)
        → Controller → Service → Prisma (SQL transaction)
        → Audit interceptor (writes the entry in the SAME SQL transaction)
```

The audit write happens **inside the business transaction**: if the operation is rolled back, the audit entry does not persist; if the audit fails, the operation fails. An audit decoupled from the write has no evidentiary value.

### Content of an entry

```json
{
  "id": 84213,
  "userId": "usr_...",
  "actorType": "USER",
  "action": "transaction.update",
  "entityType": "Transaction",
  "entityId": "txn_...",
  "before": { "amountMinor": "12500", "categoryId": "cat_transport" },
  "after":  { "amountMinor": "15000", "categoryId": "cat_alimentation" },
  "metadata": { "reason": null },
  "ipHash": "a3f1...",
  "userAgent": "Mozilla/5.0 ...",
  "requestId": "req_01J9...",
  "occurredAt": "2026-07-28T13:42:07.331Z"
}
```

Content rules:

| Rule | Statement |
|---|---|
| RG-AU1 | `before`/`after` contain only the **modified fields**, not the entire entity. |
| RG-AU2 | Blacklist of fields never logged: `passwordHash`, `refreshTokenHash`, any field named `*token*`, `*secret*`, `*password*`. This list is centralized and tested. |
| RG-AU3 | Batch operations produce **one** entry with a counter, not one entry per row (`transaction.bulk_update`, `metadata: { count: 143 }`). |
| RG-AU4 | System actions carry `actorType = SYSTEM` or `SCHEDULER` and `userId` is filled in when the action concerns a specific user. |
| RG-AU5 | Reads are not logged, **except** for three sensitive cases: data export, viewing the audit log itself, and login. |

### Actions to log (minimum list)

```
auth.login, auth.login_failed, auth.logout, auth.refresh,
auth.password_change, auth.password_reset, auth.session_revoke
user.update, user.base_currency_change, user.delete, user.export

account.create|update|delete|archive|reconcile
transaction.create|update|delete|bulk_create|bulk_update|bulk_delete
transfer.create|update|delete
category.create|update|delete|reassign
tag.create|update|delete
budget.create|update|delete|period_close
debt.create|update|delete|schedule_regenerate
debt_payment.record|delete
goal.create|update|delete|contribution_add|contribution_delete
recurrence.create|update|delete|materialize|skip
rule.create|update|delete
import.upload|commit|revert
export.transactions|export.full
currency.rate_create|rate_delete
```

### Consultation

- `GET /audit-log`: the user's journal, filterable.
- `GET /audit-log/:entityType/:entityId`: full history of an entity, presented as a timeline in the interface ("Modified on 07/12: amount 12,500 → 15,000").
- No write or delete endpoint is exposed.

### Retention

24 rolling months of retention. Beyond that, archival to cold storage (monthly export) then purge. The purge itself is logged with `actorType = SYSTEM`.

---

## 8. Personal data

- **Minimization**: only email, display name, and preferences are collected. No phone number, no address, no date of birth.
- **Right of access and portability**: `GET /me/export` provides all data in an open format.
- **Right to erasure**: `DELETE /me` marks the account as deleted, revokes sessions, and triggers a physical purge at D+30. The delay allows for recovery in case of error; it is announced to the user.
- **Retention**: data is retained as long as the account is active. An account inactive for 24 months is notified before any action.
- **Subprocessors**: no third-party service receives financial data in V1. If a transactional email provider is used, it only receives the address and the message content.

---

## 9. Application security — concrete points of vigilance

**Excel import** — never evaluate the formulas of an imported workbook. Read the calculated values or the raw string, never execute.

**CSV export** — any cell starting with `=`, `+`, `-`, `@`, a tab, or a carriage return is prefixed with an apostrophe. Without this, a transaction label containing a formula executes upon opening in Excel.

**Upload** — verify the MIME type **and** the file signature, not just the extension. Store outside the web root, under a generated name.

**HTTP headers** — strict `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, minimal `Permissions-Policy`.

**CORS** — explicit origin allowlist. Never `*` with `credentials`.

**Dependencies** — `npm audit` in CI, monthly updates, lockfile locking.

---

## 10. Backups and restoration

- Daily full backup + continuous logging (PITR) over 7 days.
- Retention: 7 daily, 4 weekly, 12 monthly.
- **Mandatory quarterly restore test.** A backup that is never restored is not a backup.
- Objectives: RPO 1 h, RTO 4 h.
