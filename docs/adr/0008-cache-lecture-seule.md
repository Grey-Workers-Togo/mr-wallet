# ADR-0008 — Offline consultation cache, read-only

## Status
Accepted — 2026-07-28. **Scope restricted to the web since 2026-09-03** ([ADR-0010](0010-offline-first-mobile.md)).

This consultation cache remains the strategy for the Next.js web front. It does **not** apply to the mobile client, which is offline-first: on mobile, RG-OF1 (no buffered writes) is explicitly lifted and replaced by the protocol in `14-sync-protocol.md`.

Qualifies [ADR-0004](0004-abandon-offline-first.md), which is likewise restricted to the web.

## Context

ADR-0004 rules out offline-first: no synchronized local database, no conflict resolution. The reasoning still holds — it is **writes** offline that create the complexity (two devices modify the same transaction; which balance is authoritative?).

But with the choice of an installable PWA (ADR-0007), mobile usage becomes central, and the expectation changes: opening your budget application in an underground train to check a balance is an ordinary use case. An empty screen in that situation is perceived as a breakdown.

The useful distinction is therefore not "online / offline" but **"read / write"**. Reading offline costs a fraction of offline-first and covers most of the frustration.

## Decision

A service worker caches a **bounded subset of data, read-only**.

### Cache scope

| Data | Cached |
|---|---|
| Accounts and current balances | Yes |
| Last 90 days of transactions | Yes |
| Categories, tags | Yes |
| Current budget periods | Yes |
| Debts: summary and next due date | Yes |
| Goals and progress | Yes |
| Reports and forecasts | **No** — computed server-side, potentially heavy |
| Audit log | **No** |
| History beyond 90 days | **No** |

### Behavior with no network

- Consultation screens render from the cache, with a permanent banner reading **"Offline — data as of <date/time of last sync>"**.
- Every write action is **disabled**, not queued. Buttons are greyed out with an explanation, never an error after the fact.
- When the network returns, the cache is refreshed and the banner disappears.

### Rules

| Rule | Statement |
|---|---|
| RG-OF1 | No write is ever buffered locally. No operation queue, no deferred synchronization. This is what distinguishes this cache from offline-first. |
| RG-OF2 | Any data served from the cache is visually marked as such, with its freshness date. A stale balance displayed as a current one is worse than no balance at all. |
| RG-OF3 | The cache is encrypted at rest and **purged on logout**, as well as on refresh token expiry. |
| RG-OF4 | The cache expires after 7 days without refresh. Beyond that, the application shows a "data too old" screen rather than doubtful figures. |
| RG-OF5 | The application lock (PIN) also applies to access to cached data. |

## Consequences

**Benefits** — The application stays useful without a network for what matters most ("how much do I have left"). No conflict-resolution complexity: the server remains the sole source of truth at all times.

**Costs** — A service worker to maintain, an invalidation strategy, and financial data stored on the device (hence the encryption and the purge on logout). The interface must handle three states instead of two: online, offline with a valid cache, offline with a stale cache.

**Position** — This decision does not reopen offline-first. If a need for offline writes appears, it will be the subject of a separate ADR, with the synchronization work that implies. *(That ADR is [ADR-0010](0010-offline-first-mobile.md), for the mobile client.)*

## Sequencing

Implemented at **lot 7** (MVP finishing), not before. The cache is added to an application that works; introducing it too early complicates debugging everything else.
