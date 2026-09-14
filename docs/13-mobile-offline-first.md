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

ADR-0010 extends offline mode to reports. This is the most demanding part of the design, and the one that deserves the least optimism.

### 6.1 The problem

The server computes reports in aggregated SQL over PostgreSQL (RG-RP1, `04-modules.md § J`). The device must produce **the same figures** over SQLite. Two implementations, two SQL dialects, two date-function sets. Left to discipline alone, they will drift — and a report that disagrees with itself between the phone and the web destroys trust in the product faster than any missing feature.

### 6.2 The mechanism: a shared oracle

`packages/analytics-core` (ADR-0012) holds a **pure TypeScript reference implementation** of every report and forecast. It is not what runs in production on either side. It is the oracle both are tested against.

```
                  packages/analytics-core
                  (pure TS reference impl.)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
      PostgreSQL SQL                 SQLite SQL
      (apps/api)                     (apps/mobile)
              └─────────────┬─────────────┘
                            ▼
              parity suite — shared fixtures
              any discrepancy fails CI
```

### 6.3 Rules

| Rule | Statement |
|---|---|
| RG-MR1 | Every report available offline exists in three forms: reference (TS), server (Postgres SQL), device (SQLite SQL). |
| RG-MR2 | The parity suite runs on a shared fixture set — including edge cases: 0-decimal currency (XOF), multi-currency, period boundaries across a timezone offset, transactions on the exact boundary, soft-deleted rows. |
| RG-MR3 | **Any discrepancy fails the build.** Not a warning, not a tolerance. Equality is exact, to the minor unit. |
| RG-MR4 | A report that cannot be made parity-verified is **server-only**, and shown offline as requiring a connection. Better an unavailable report than a wrong one — this is the same principle as RG-OF2. |
| RG-MR5 | Local computation is capped: beyond a documented volume threshold, the screen offers server computation rather than freezing the device. Measured at lot M6, not guessed. |
| RG-MR6 | Multi-currency conversion follows the same conservative rule as the server (`QUESTIONS.md`, RG-RP2), using the replicated rate table. A conversion whose rate is missing locally is displayed as unavailable, never with a stale rate. |

### 6.4 Server-only in all cases

Full multi-year net-worth history beyond the replicated scope, cross-user comparisons (none exist today), and anything requiring the audit log.

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
