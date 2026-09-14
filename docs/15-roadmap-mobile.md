# 15 — Mobile roadmap

Implementation order for `apps/mobile` ([ADR-0010](adr/0010-offline-first-mobile.md), [ADR-0011](adr/0011-stack-mobile-expo-react-native.md), [ADR-0012](adr/0012-mobile-in-the-existing-monorepo.md)).

Numbered `M0`–`M8` to run in parallel with the `09` / `12` lot numbering rather than extend it: the mobile track has its own sequence.

Same rules as the other roadmaps: lots are **sequential**, each ends functional and tested, definition of done per `10-conventions-dev.md`. Estimates are for one full-time developer.

**Prerequisite: MVP lot 7 complete.** Building an offline client against an API still changing shape means building the synchronization protocol twice.

---

## M0 — Server groundwork (≈ 1 week, in `apps/api`)

No mobile code yet. Everything else depends on it, and it is worth shipping to the web front too.

- Client-supplied `id` accepted on creation across every business module (RG-SY3).
- `sync` module: `POST /sync/push`, `GET /sync/changes`, `GET /sync/snapshot`.
- `updatedAt` / `deletedAt` exposed on read DTOs; `(userId, updatedAt, id)` indexes.
- `packages/sync-protocol` extracted, imported by the API.
- Minimum client version per platform, `CLIENT_TOO_OLD` (RG-SY14).
- Replay, ordering and interruption tests (`14-sync-protocol.md § 6`) — against a simulated client, no device needed.

**Exit criterion**: a scripted client pushes 200 operations, is interrupted at 20 random points, resumes, and produces exactly 200 entities with balances equal to an independent recomputation.

---

## M1 — Mobile foundations (≈ 1 week)

- `apps/mobile` in the monorepo, Expo development build (**not** Expo Go — `op-sqlite` and SQLCipher require it), Metro configured for workspace symlinks.
- Expo Router, i18n sharing the web's message files, design system ported from `DESIGN_SYSTEM.md`.
- Encrypted SQLite + Drizzle, local schema, migrations, key in `expo-secure-store`.
- `BigInt` chain proven end to end: SQLite `INTEGER` → binding → `money` kernel, tested above 2^53 (RG-MD2).
- Authentication, tokens in secure storage, EAS Build pipeline in CI.

**Exit criterion**: the app builds for iOS and Android, a user logs in, and an amount above 2^53 minor units round-trips through the local database unchanged.

---

## M2 — Replica and pull (≈ 1 week)

- Bootstrap snapshot, resumable, with a progress screen (RG-MU6).
- Incremental pull, cursors in `sync_state`, tombstone handling.
- Read-only screens over the replica: accounts, transaction list, categories.
- Sync states in the UI: synchronized / offline (RG-MU1).

**Exit criterion**: after bootstrap, the app displays the full history in airplane mode; a change made on the web appears after one pull, and a deletion propagates.

---

## M3 — Outbox and push (≈ 1.5 weeks)

The critical lot.

- `outbox` table, local write path (`13-mobile-offline-first.md § 4`), client-side UUIDv7.
- Serial FIFO push engine, resumable, wired to `Idempotency-Key`.
- Projection layer, unit-tested with no device.
- Quick entry (UC-02) working offline, with the pending marker (RG-MP1).
- Convergence and balance-integrity tests (`14-sync-protocol.md § 6`).

**Exit criterion**: 50 transactions entered offline across two simulated devices, then synchronized, produce exactly 50 transactions and server balances identical to an independent recomputation. Offline entry stays under 15 seconds (RG-MU5).

---

## M4 — Conflicts (≈ 1 week)

- Statuses `conflict` / `rejected` handled end to end, `outbox_conflicts` table.
- Conflict tray, comparison cards, three resolution actions (RG-MU4).
- Parked operations leave the projection (RG-SY12), never auto-retried (RG-SY13).
- Conflict metrics (RG-SY15).

**Exit criterion**: the same transaction edited on two offline devices raises exactly one conflict, resolvable either way, with no silent loss and no balance drift.

---

## M5 — Full write coverage (≈ 1.5 weeks)

- Remaining operations in the catalogue (`14-sync-protocol.md § 2.1`): budgets, goals, debts, recurrences, tags, bulk operations.
- Server-only operations properly disabled offline, with an explanation (RG-MW6).
- Attachments: metadata queued, binary uploaded on reconnection.

**Exit criterion**: every MVP use case except file import completes offline and synchronizes without conflict when there is no genuine concurrency.

---

## M6 — Local reports and forecasts (≈ 2 weeks)

The lot to schedule generously. It carries the duplication ADR-0010 accepted.

- `packages/analytics-core`: pure reference implementation of every report and forecast.
- SQLite implementation of each, alongside the existing Postgres one.
- Parity suite on shared fixtures — XOF (0 decimals), multi-currency, timezone boundaries, soft deletes (RG-MR2, RG-MR3).
- Report and forecast screens, `victory-native` charts.
- Volume threshold measured, above which computation falls back to the server (RG-MR5).

**Exit criterion**: every offline report matches its server counterpart to the minor unit on the full fixture set, and the parity suite is wired into CI as a blocking check.

---

## M7 — Native security and push (≈ 1 week)

- Biometric unlock + PIN fallback (RG-MS3), lock gating database access (RG-MS4).
- Purge after 5 failed attempts, with the pending count shown beforehand (RG-MS5).
- Logout blocked with a non-empty outbox (RG-MS7).
- Native push via APNs/FCM — closes ADR-0007's iOS Web Push limitation.
- Background sync (`expo-background-task`), battery-aware.

**Exit criterion**: no local data is readable without biometrics or PIN; a notification reaches iOS and Android reliably; the app synchronizes in the background without measurable battery impact over a day of normal use.

---

## M8 — Finishing and store release (≈ 1.5 weeks)

- Full i18n pass in `fr` and `en` on every mobile screen.
- Accessibility: touch targets ≥ 44 px, screen readers, contrast.
- Performance on the transaction list (`FlashList`, virtualization), measured on a low-end Android device — not only on a simulator.
- Maestro e2e on the 13 MVP use cases, **including a full offline flow and a conflict flow**.
- Store assets, privacy policy, App Store and Play Store submission.
- EAS Update channel wired up for JS-layer fixes.

**Exit criterion**: both builds accepted by the stores, offline e2e green in CI.

---

## Verification milestones

| Milestone | Verification |
|---|---|
| End of M0 | Interrupted push produces no duplicate and no balance drift |
| End of M3 | Two-device convergence: balances exact to the minor unit |
| End of M4 | No conflict silently loses a user operation |
| End of M6 | Report parity blocking in CI, zero discrepancy |
| End of M7 | Local data unreadable without unlocking |
| End of M8 | Full offline flow green e2e on a real device |

---

## Overall estimate

Roughly **11 to 12 weeks** for one full-time developer, M6 being the least predictable. This does not overlap the V2 lots of `12-roadmap-v2.md`; if both tracks run at once, M0 must land before any V2 lot touching a business module, so that the client-supplied-id change is made once rather than retrofitted.
