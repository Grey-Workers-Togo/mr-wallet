# 13 — Mobile application, offline-first

Design of the `apps/mobile` client decided in [ADR-0010](adr/0010-offline-first-mobile.md) (offline-first), [ADR-0011](adr/0011-stack-mobile-expo-react-native.md) (Expo / React Native) and [ADR-0012](adr/0012-mobile-in-the-existing-monorepo.md) (monorepo).

The synchronization protocol itself — operation catalogue, envelopes, conflict codes, server endpoints — is specified separately in `14-sync-protocol.md`. This document covers the client: its layers, its local database, its projections, its reports, its security and its interface states.

---

## 1. Governing principle

> **The device holds a replica and a queue of intents. It never holds a truth of its own.**

Everything below follows from that sentence. When a design question arises that this document does not answer, it is the sentence to apply.

Three immediate corollaries:

- No screen computes a value the server also computes, other than as an **optimistic projection** explicitly labelled as such internally.
- No local write ever modifies replicated data in place. It appends an operation.
- No derived value — balance, budget consumption, goal progress — is ever transmitted to the server.

---

## 2. Layers

```
┌──────────────────────────────────────────────────────────┐
│  UI  (Expo Router screens, React components)             │
│  Reads only projections. Writes only via useMutation.    │
└───────────────────────────┬──────────────────────────────┘
┌───────────────────────────▼──────────────────────────────┐
│  Projection layer                                        │
│  replica ⊕ replay(outbox) → what the screen displays     │
│  Pure, synchronous, testable without a device.           │
└───────────────────────────┬──────────────────────────────┘
┌───────────────────────────▼──────────────────────────────┐
│  Local store (SQLite / SQLCipher, Drizzle)               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │ replica tables │  │ outbox         │  │ sync_state │  │
│  │ (pull only)    │  │ (local writes) │  │ (cursors)  │  │
│  └────────────────┘  └────────────────┘  └────────────┘  │
└───────────────────────────┬──────────────────────────────┘
┌───────────────────────────▼──────────────────────────────┐
│  Sync engine                                             │
│  push(outbox) → pull(changes) → reconcile                │
│  Serial, resumable, idempotent.                          │
└───────────────────────────┬──────────────────────────────┘
                            │  REST/JSON + Bearer
┌───────────────────────────▼──────────────────────────────┐
│  API (NestJS) — sole source of truth                     │
└──────────────────────────────────────────────────────────┘
```

The projection layer is the piece to get right. It is pure TypeScript over rows already read from SQLite: no I/O, no React, no dates read from the system clock other than through an injected clock. It is therefore unit-testable in full, and it is where every "why does my balance show this number" bug will be diagnosed.

---

## 3. Local database

### 3.1 Structure

| Group | Tables | Written by |
|---|---|---|
| Replica | `accounts`, `transactions`, `categories`, `tags`, `transaction_tags`, `budgets`, `budget_periods`, `debts`, `debt_installments`, `debt_payments`, `goals`, `goal_contributions`, `recurrences`, `currencies`, `exchange_rates`, `notifications`, `attachments` (metadata only) | Pull only |
| Local | `outbox`, `outbox_conflicts` | Local writes only |
| System | `sync_state`, `schema_meta` | Sync engine |

Not replicated: `audit_log` (server-only, RG-MD5), `import_batches` and their rows (import needs a network anyway), report and forecast caches (recomputed locally).

### 3.2 Rules

| Rule | Statement |
|---|---|
| RG-MD1 | Replica tables mirror the server's field names exactly (`03-modele-donnees.md`). No renaming, no local restructuring — a difference in naming becomes a mapping, and a mapping becomes a bug. |
| RG-MD2 | Amounts are stored as SQLite `INTEGER` (64-bit signed) and read as `bigint`. **No amount ever passes through `Number`** (ADR-0002). A test asserts round-tripping of a value above 2^53. |
| RG-MD3 | Dates are stored in UTC as ISO-8601 text. Period boundaries are computed with `user.timezone`, never the device's timezone (`02-architecture.md § 7`). |
| RG-MD4 | Soft delete is replicated: `deletedAt` is a real column, and a tombstone received from the server sets it. No physical `DELETE` on replica tables either. |
| RG-MD5 | The audit log is never replicated. Consulting it requires a connection. |
| RG-MD6 | The local database stores no text intended to be read by a human, other than data the user entered themselves (ADR-0009). Notifications are stored as `type` + `params`; categories as `i18nKey` + optional user-supplied `name`. |
| RG-MD7 | The local schema is versioned with its own migrations (Drizzle). A migration must be able to run on a database holding a non-empty outbox — a pending operation must never be lost to an app upgrade. |
| RG-MD8 | Replication is **complete** for the entity types above, not a sliding window. Local reports depend on it. Volumes are compatible with this (a few thousand transactions per user, ADR-0001); beyond a documented threshold, § 6.4 applies. |

### 3.3 Bootstrap

On first login on a device, the client downloads a full snapshot (`GET /sync/snapshot`, `14-sync-protocol.md § 5.1`) rather than paging through the change feed from the beginning. The snapshot is streamed and written in batches, with a resumable progress indicator: interrupting it must not require starting over.

Until the bootstrap completes, the app runs in **online-only degraded mode** — usable, but showing that offline mode is not yet ready.

---

## 4. Local writes

Every user action follows the same path, with no exception and no special case:

```
1. Validate the payload with the Zod schema from packages/contracts
   → invalid: form error, nothing is queued.
2. Generate the entity id client-side (UUIDv7).
3. Append one row to `outbox`
   (id = idempotency key, op, payload, baseVersion, createdAt).
4. Invalidate the affected projections → the UI updates immediately.
5. Wake the sync engine (fire and forget).
```

Steps 1 to 4 are a single SQLite transaction. The user sees the result in under a frame, network or no network.

| Rule | Statement |
|---|---|
| RG-MW1 | Local validation uses the **same** Zod schema as the server (`packages/contracts`). A payload that passes locally and is rejected server-side is a bug in the shared schema, not an expected case. |
| RG-MW2 | Entity ids are generated client-side as UUIDv7 and accepted by the server as-is. No local-to-server id remapping, ever — it is the classic source of broken references in a sync engine. |
| RG-MW3 | The outbox is strictly ordered and pushed FIFO. Causal dependencies (create an account, then a transaction on it) are guaranteed by ordering alone, with no dependency graph. |
| RG-MW4 | An operation is never rewritten in the outbox. Editing a locally created transaction that has not yet synced appends a second operation. Compaction, if introduced later, is an optimization to be proven correct, not a starting design. |
| RG-MW5 | The client never sends a derived value: no `currentBalanceMinor`, no budget consumption, no goal progress. The server recomputes them (ADR-0003). |
| RG-MW6 | Operations that require the server are not queued: file import, full export, audit consultation. Their entry points are disabled offline, with an explanation — ADR-0008's behaviour, kept for these cases only. |

---

## 5. Projections

A projection = replica rows + replay of pending outbox operations for the same scope.

| Projection | Replay rule |
|---|---|
| Transaction list | Pending creations inserted in date order, pending edits applied over the replica row, pending deletions filtered out. |
| Account balance | Replica balance ± the net effect of pending operations on that account. |
| Budget consumption | Replica consumption + pending amounts falling within the period and category. |
| Goal progress | Replica progress + pending contributions. |
| Debt outstanding | Replica outstanding − pending repayments. |

| Rule | Statement |
|---|---|
| RG-MP1 | Anything carrying a pending contribution is visually marked as **not yet synchronized**, at row level and at aggregate level. The user must be able to tell an entry that exists on the server from one that exists only on their phone. |
| RG-MP2 | Once the server acknowledges, the outbox row is deleted and the projection collapses onto the replica. If the two disagree, **the replica wins, silently** — it is the truth (ADR-0010 § 1). The optimistic projection was an estimate. |
| RG-MP3 | A projection never persists. It is computed on read. Persisting one would create a third plane to keep coherent. |
| RG-MP4 | An operation parked in conflict (`14-sync-protocol.md § 4`) leaves the projection: its effect on displayed figures disappears, and it appears in the conflict tray instead. A rejected operation must never keep inflating a balance. |

---

## 6. Reports and forecasts computed locally

ADR-0010 extends offline mode to reports. That sounds like the most expensive part of the design. It is not, and the reason is worth stating precisely, because the obvious implementation — porting the server's aggregation queries to SQLite — is the expensive one and is **not** what is specified here.

### 6.1 The eight reports need no second aggregation engine

Taking the reports of `04-modules.md § J` one by one, each decomposes into something the device already holds:

| Report | What it actually is on the device |
|---|---|
| 1. Expenses by category | Sum over replicated rows |
| 2. Monthly trend | Sum over replicated rows |
| 3. Net worth over time | Cumulative sums + the amortization engine (a pure function, already shared) |
| 4. Cash flow | Sum over replicated rows |
| 5. Period comparison | Two slices of the above |
| 6. Top expenses | Not an aggregate at all — a row query, `ORDER BY … LIMIT n` |
| 7. Budget vs actual | Replicated budget rows against the sums above |
| 8. Debts | Pure domain functions, already shared (lot 5) |

Not one requires porting a PostgreSQL aggregation query to SQLite.

RG-RP1 — *all aggregates in SQL, never loaded in memory* — is a **server** rule, and a correct one: it exists because the server handles many users concurrently over an unbounded history. On a device holding one user's few thousand rows (RG-MD8), aggregating in memory takes milliseconds. Applying a server constraint to a client with different properties would buy nothing and cost a second implementation.

### 6.2 `analytics-core` is executed, not merely tested against

```
              packages/analytics-core
              pure TypeScript, no I/O
                        │
          ┌─────────────┴──────────────┐
          │                            │
   test oracle for              THE mobile
   PostgreSQL SQL               implementation
   (apps/api)                   (apps/mobile,
          │                      over SQLite rows)
          ▼
   parity suite — two branches
```

The device does not reimplement the reports. It **runs the reference implementation** over rows read from its local database. The consequence is the important part: the mobile client is removed from the divergence surface by construction, not by discipline. There is nothing on the device that could drift from the reference, because it *is* the reference.

The parity suite therefore compares two branches, not three: the server's SQL against `analytics-core`. That check is worth keeping regardless — it is what guarantees the server's optimized SQL still means what the reference says it means.

### 6.3 Rules

| Rule | Statement |
|---|---|
| RG-MR1 | Every report available offline is computed by `packages/analytics-core`, over rows read from the local database. No aggregation SQL is written for SQLite. |
| RG-MR2 | The same `analytics-core` functions are the oracle for the server's SQL. The parity suite runs on shared fixtures, including the edge cases: 0-decimal currency (XOF), multi-currency, period boundaries across a timezone offset, transactions exactly on a boundary, soft-deleted rows. |
| RG-MR3 | **Any discrepancy between server SQL and `analytics-core` fails the build.** Not a warning, not a tolerance. Equality is exact, to the minor unit. |
| RG-MR4 | A report that cannot be expressed in `analytics-core` is server-only, and shown offline as requiring a connection. Better an unavailable report than a wrong one — same principle as RG-OF2. |
| RG-MR5 | Local computation is capped: beyond a volume threshold **measured at lot M6 on a low-end Android device**, the screen offers server computation rather than freezing. If a specific report proves too slow, it — and it alone — may receive a dedicated SQLite query, which then re-enters a three-branch parity check. That is an exception justified by a measurement, never a default. |
| RG-MR6 | Multi-currency conversion follows the same conservative rule as the server (`QUESTIONS.md`, RG-RP2), using the replicated rate table. A conversion whose rate is missing locally is displayed as unavailable, never with a stale rate. |
| RG-MR7 | Reports are computed on read, never persisted locally. A cached report would be a fourth plane of state to keep coherent, and § 1 already says the device holds no truth of its own. |

### 6.4 Server-only in all cases

History beyond the replicated scope, and anything requiring the audit log.

### 6.5 The assumption this rests on

This works because each user's dataset is small and fully replicated (RG-MD8). If either changes — a much larger history, a shared household dataset, partial replication — full local reporting stops being viable and RG-MR4 becomes the general case rather than the exception. This is the condition to re-examine first if the design ever feels strained.

---

## 7. Security on the device

Extends `07-securite-audit.md`. Native storage changes what is possible relative to ADR-0007's PWA constraints.

| Rule | Statement |
|---|---|
| RG-MS1 | The SQLite database is encrypted at rest (SQLCipher). The key is generated on the device, stored in the Keychain (iOS) / Keystore (Android) via `expo-secure-store`, and never leaves it. |
| RG-MS2 | The refresh token is stored in the same secure storage, not in the JS layer. `07-securite-audit.md`'s RG-S1 (HttpOnly cookie) is a web mechanism with no native equivalent; secure hardware-backed storage is the equivalent guarantee. The access token stays in memory (RG-S2). |
| RG-MS3 | Unlock uses **system biometrics** with a PIN fallback. ADR-0007's limitation no longer applies: `expo-local-authentication` is available on both platforms. The PIN remains mandatory as a fallback and follows RG-S6 to RG-S8. |
| RG-MS4 | The lock blocks access to local data, not just the interface (RG-S7). The database is opened only after unlocking. |
| RG-MS5 | After 5 failed PIN attempts, the local database is purged and full re-authentication is required (RG-S8). **Pending outbox operations are lost** — this is deliberate, and the count of pending operations is shown on the lock screen so the loss is never a surprise. |
| RG-MS6 | On logout, everything is purged: database, key, tokens, push registration (RG-S4). |
| RG-MS7 | **Logout with a non-empty outbox is blocked** by default. The user is offered: sync now, or log out and lose N operations, listed explicitly. Silently discarding entered data is not acceptable. |
| RG-MS8 | No token, no payload, no amount is written to the application log in a release build. |
| RG-MS9 | Attachments cached locally are stored in the app's encrypted sandbox, never in the shared gallery. |

---

## 8. Interface states

The read-only cache had three states (`ADR-0008`). Offline-first has five, and each needs a distinct visual treatment. Conflating them is the main way this design fails in the user's perception.

| State | Display |
|---|---|
| **Synchronized** | Nothing. The normal state deserves no banner. |
| **Pending** — local operations awaiting push | Discreet indicator with a count, tappable to see the queue. Affected rows carry a marker (RG-MP1). |
| **Offline** — no network, everything works | Sober persistent banner: offline, N pending operations. No alarm tone: this is a supported mode, not a failure. |
| **Conflict** — one or more operations refused | Actionable notification, badge on the sync indicator, dedicated tray. Never blocking — the rest of the app keeps working. |
| **Blocked** — client too old, invalid token, corrupted database | Full screen with a single action. The only state that stops the app. |

| Rule | Statement |
|---|---|
| RG-MU1 | The "offline" state is never displayed as an error. It is a nominal mode. |
| RG-MU2 | Any figure influenced by a pending operation shows it. RG-OF2's principle — never present an uncertain figure as certain — becomes: never present an unconfirmed figure as confirmed. |
| RG-MU3 | The last successful synchronization time is reachable in two taps at most, from anywhere. |
| RG-MU4 | A conflict is never resolved by the app. It is presented with both versions and an explicit user choice (`14-sync-protocol.md § 4`). |
| RG-MU5 | Quick entry (UC-02, < 15 s) is measured **offline**. It is the reference journey; it must not be slower with no network than with one. |
| RG-MU6 | Data is never shown as empty while the bootstrap is still running. That state has its own screen, with progress. |

---

## 9. What does not change

- The API stays client-agnostic (`02-architecture.md § 7`). The additions of `14-sync-protocol.md § 5` are additive; no existing endpoint changes shape.
- The web front keeps its read-only cache (ADR-0008). Offline-first is not retrofitted onto it.
- `10-conventions-dev.md` applies identically to `apps/mobile`: strict TypeScript, no `any`, pure functions for anything computing, no hardcoded user-visible strings, key parity in CI.
- ADR-0009 governs the local database as it governs the server one: identifiers and parameters, never rendered text.
