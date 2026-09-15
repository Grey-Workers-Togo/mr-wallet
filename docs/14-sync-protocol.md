# 14 — Synchronization protocol

Contract between `apps/mobile` and `apps/api`, required by [ADR-0010](adr/0010-offline-first-mobile.md). Its definitions live in `packages/sync-protocol` (ADR-0012) and are imported by both sides — neither may declare an operation the other does not know.

The client design is in `13-mobile-offline-first.md`.

---

## 1. Model

Three exchanges, and no others:

| Exchange | Direction | Purpose |
|---|---|---|
| **Snapshot** | server → client | Initial full replica, once per device |
| **Push** | client → server | Sends pending operations |
| **Pull** | server → client | Retrieves changes since a cursor |

A synchronization cycle is always **push, then pull**, never the reverse. Pushing first guarantees the pulled state already includes the client's own operations, so the client never receives a state that would contradict what it is about to send.

Push is **serial and FIFO** (RG-MW3). No parallelism, no batching that reorders. Causal dependencies are guaranteed by ordering alone.

---

## 2. Operations

An operation is an **intent**, not a state. Its name says what the user did, not which rows to write.

```ts
type Operation = {
  id: string;            // UUIDv7, client-generated, = Idempotency-Key
  op: OperationName;     // catalogue below
  payload: unknown;      // validated by the op's Zod schema (packages/contracts)
  baseVersion?: string;  // updatedAt of the replica row, for edits/deletes
  clientTime: string;    // ISO-8601 UTC, informational only
};
```

### 2.1 Catalogue

| `op` | Payload | Notes |
|---|---|---|
| `account.create` / `account.update` / `account.archive` / `account.delete` | Account DTO | Never `currentBalanceMinor` (RG-MW5) |
| `account.reconcile` | `{ accountId, actualBalanceMinor, asOfDate }` | Carries the **declared actual balance**, never the computed delta. The server computes the difference and creates the adjustment (RG-A13). A textbook case of RG-SY1. |
| `transaction.create` | Transaction DTO with client-supplied `id`, optional fee | The core operation. A fee is one field on this payload; the server creates the fee line in the same SQL transaction (RG-T12). It is never a second operation — that would let a parent sync without its fee. |
| `transaction.update` / `transaction.delete` | Partial DTO + `baseVersion` | |
| `transfer.create` | Two-leg DTO | Atomic server-side, one operation client-side |
| `transaction.bulkCategorize` | `{ ids[], categoryId }` | Partial application forbidden: all or nothing |
| `category.create` / `update` / `delete` | Category DTO | `delete` carries the reassignment target |
| `tag.create` / `delete`, `transaction.setTags` | | |
| `budget.create` / `update` / `delete`, `budget.planCreate` | | `planCreate` is atomic (lot 17) |
| `goal.create` / `update` / `delete`, `goal.contribute` | | |
| `debt.create` / `update`, `debt.recordPayment`, `debt.simulateEarlyRepayment` | | Repayment emits the linked transaction server-side (`02-architecture.md § 4`) |
| `recurrence.create` / `update` / `delete` / `skipOccurrence` | | |
| `attachment.create` | Metadata; the binary is uploaded separately on reconnection | |
| `notification.markRead` | | Idempotent by nature |

**Not operations** — they require a network and are never queued (RG-MW6): file import, full export, audit consultation, exchange-rate refresh.

### 2.2 Rules

| Rule | Statement |
|---|---|
| RG-SY1 | An operation carries an **intent**, never a computed result. No balance, no consumption, no progress figure crosses the wire client-to-server. |
| RG-SY2 | `Operation.id` is the idempotency key. It reuses the existing mechanism (`02-architecture.md § 7`): replaying an already-applied operation returns the original response without re-applying it. |
| RG-SY3 | Entity ids are supplied by the client (UUIDv7). The server accepts them after checking format and user scope. An id already existing for that user means a replay: the server returns the existing entity, it does not error. |
| RG-SY4 | Every operation payload is validated by the **same Zod schema** on both sides. Local validation before queuing is required (RG-MW1). |
| RG-SY5 | Adding an operation to the catalogue is a change to `packages/sync-protocol`, and requires handling on both sides in the same commit (RG-RE2). |

---

## 3. Endpoints

### 3.1 `POST /sync/push`

```jsonc
// request
{ "deviceId": "…", "platform": "IOS", "clientVersion": "1.4.0", "operations": [ /* ≤ 100, ordered */ ] }

// response
{
  "results": [
    { "id": "…", "status": "applied",  "entity": { /* server state after apply */ } },
    { "id": "…", "status": "duplicate","entity": { /* … */ } },
    { "id": "…", "status": "conflict", "code": "STALE_WRITE", "params": {…},
      "current": { /* current server state */ } },
    { "id": "…", "status": "rejected", "code": "CATEGORY_NOT_FOUND", "params": {…} }
  ],
  "stoppedAt": null   // index of the first operation not processed, or null
}
```

`platform` (`WEB` / `IOS` / `ANDROID`) identifies which minimum-version floor applies (RG-SY14) — nothing else in the request does.

Server-side processing is **sequential and stops at the first `conflict` or `rejected`**. Operations after it are not applied and come back in the next push. This preserves ordering: applying operation 5 after refusing operation 3 could apply an edit to an entity that was never created.

`applied` and `duplicate` are equivalent for the client: the outbox row is deleted.

### 3.2 `GET /sync/changes?since=<cursor>&limit=<n>`

```jsonc
{
  "changes": [
    { "entity": "transaction", "id": "…", "op": "upsert", "data": { /* … */ } },
    { "entity": "transaction", "id": "…", "op": "tombstone", "deletedAt": "…" }
  ],
  "cursor": "…",     // to pass to the next call
  "hasMore": true
}
```

The cursor is opaque, and encodes `(updatedAt, id)` to guarantee a total order and no gaps on equal timestamps. Tombstones come from the existing `deletedAt` (RG-MD4): soft delete makes them free — nothing new to store server-side.

### 3.3 `GET /sync/snapshot`

Full replica for a first login on a device (`13-mobile-offline-first.md § 3.3`). Paginated, resumable, and returns the cursor to continue from with `/sync/changes`.

### 3.4 Rules

| Rule | Statement |
|---|---|
| RG-SY6 | A push is atomic **per operation**, not per batch. A refused operation does not roll back those already applied before it. |
| RG-SY7 | Push and pull are both fully resumable. An interruption at any point leaves a coherent state; the retry is a replay, protected by RG-SY2. |
| RG-SY8 | The cursor is opaque to the client. It is stored as an unread token; the client never parses or constructs one. |
| RG-SY9 | Server-side changes are exposed as a single ordered feed, not per entity type. Ordering across types is what keeps referential integrity on the client. |
| RG-SY10 | Every synchronization is audited server-side like any other mutation (`07-securite-audit.md`), with the `deviceId` and the operation id. |

---

## 4. Conflicts

**No automatic resolution. Ever.** This is the point on which ADR-0004 was right, and the reason offline-first is acceptable here is not that conflicts have been solved — it is that they are made rare by design and visible when they occur.

### 4.1 Cases

| Code | Situation | Client behaviour |
|---|---|---|
| `STALE_WRITE` | The entity changed server-side since `baseVersion` | Operation parked. Conflict card showing local version vs server version, three actions: keep mine, keep server's, merge manually. |
| `TARGET_GONE` | The target entity was deleted elsewhere | Operation parked. "This transaction was deleted on another device. Recreate it?" |
| `VALIDATION_FAILED` | Payload refused by a server business rule | Operation parked with the error code. Editable then re-submittable. Indicates a shared-schema gap (RG-MW1) — to be investigated, not just handled. |
| `CURRENCY_MISMATCH`, `ACCOUNT_ARCHIVED`, … | Domain-specific refusals | Same treatment, message resolved from the code (ADR-0009). |
| `CLIENT_TOO_OLD` | Client version below the supported floor (RG-RE5) | Blocking state, forced upgrade. |

### 4.2 Rules

| Rule | Statement |
|---|---|
| RG-SY11 | No last-write-wins, no field-level automatic merge, no CRDT. A conflict is a user decision. |
| RG-SY12 | A parked operation leaves the projection immediately (RG-MP4). It must never keep affecting a displayed balance. |
| RG-SY13 | A parked operation is never auto-retried. It waits for an explicit user action. Blind retry on a rejected operation is how a duplicate transaction gets created. |
| RG-SY14 | `CLIENT_TOO_OLD` is a blocking state. The client keeps its local data intact — it does not purge — so that upgrading recovers the pending outbox. |
| RG-SY15 | Conflicts are counted and reported. A conflict rate above a threshold on `STALE_WRITE` signals a design problem, not user error. |

### 4.3 Why conflicts stay rare

- One user, their own data. Genuine concurrency requires the same person editing the same entity on two devices within the same offline window.
- Creation — by far the dominant operation — **cannot conflict**: the id is client-generated, and nothing else claims it.
- Balances, budgets and progress figures are derived: they are recomputed server-side and are never a conflict surface.
- What is left: editing or deleting the same existing entity from two devices. Real, but marginal.

---

## 5. Required server-side changes

Additive. No existing endpoint changes shape (`02-architecture.md § 7`).

| Change | Module | Notes |
|---|---|---|
| Accept a client-supplied `id` on creation | all business modules | UUIDv7 validated, scoped to the user. An existing id is a replay (RG-SY3). |
| `POST /sync/push` | new `sync` module | Dispatches to the existing module facades. Contains no business logic of its own. |
| `GET /sync/changes` | `sync` | Single ordered feed with tombstones. |
| `GET /sync/snapshot` | `sync` | Paginated, resumable. |
| Expose `updatedAt` and `deletedAt` on read DTOs | all | Required for `baseVersion` and tombstones. |
| `(userId, updatedAt, id)` index on every replicated table | Prisma | Otherwise the change feed degrades as history grows. |
| Minimum client version, per platform | config | Drives `CLIENT_TOO_OLD` (RG-RE5). |
| `DeviceToken`: add `deviceId`, `platform`, `appVersion`, `lastSyncAt` | `notifications` | The table exists; these fields are added. |

**Module placement** — `sync` is a cross-cutting module that depends on the business module facades and is depended on by none (`02-architecture.md § 4`). It adds no cycle. It owns no business rule: any rule it appears to need belongs in the module that owns the entity.

---

## 6. Verification

The synchronization engine is the highest-risk part of the project (this is what ADR-0004 said, and it remains true). It requires its own test level, distinct from unit and e2e tests.

| Test | What it establishes |
|---|---|
| **Replay** | The same operation pushed N times produces exactly one entity, one audit entry, one balance effect. |
| **Ordering** | A shuffled batch that violates causality is refused, not partially applied. |
| **Interruption** | Push cut at every possible point, then resumed: final state identical to an uninterrupted push. |
| **Convergence** | Two simulated devices, disjoint operations, offline, then sync: both converge on the same state, equal to the server's. |
| **Conflict** | Two devices editing the same entity: exactly one conflict raised, nothing silently lost. |
| **Balance integrity** | After 500 mixed operations across two offline devices, server balances equal an independent recomputation, to the minor unit. Nightly reconciliation (ADR-0003) reports zero drift. |
| **Report parity** | § 6.2 of `13-mobile-offline-first.md` — server SQL, device SQL and reference implementation agree exactly. |

The convergence and balance-integrity tests run against a simulated client, without a device, so they can live in CI and run on every commit.
