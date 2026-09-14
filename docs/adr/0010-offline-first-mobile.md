# ADR-0010 — Offline-first on mobile, server remains the sole authority

## Status
Accepted — 2026-09-03

**Supersedes [ADR-0004](0004-abandon-offline-first.md)** (rejection of offline-first), for the mobile client only.
**Amends [ADR-0008](0008-cache-lecture-seule.md)**: the read-only cache remains the web strategy; it is replaced on mobile.
**Resolves [ADR-0007](0007-strategie-mobile-pwa.md)'s re-examination clause** and closes lot 15 of `12-roadmap-v2.md`.

## Context

ADR-0004 rejected offline-first on one argument, which was correct: *offline writes create conflicts, and a badly resolved conflict on financial data produces a wrong balance*. ADR-0008 then conceded a read-only cache, and drew the line at "read yes, write never".

That line has held for the web. It does not hold for a mobile application, for three reasons:

1. **The primary mobile journey is a write.** UC-02 (quick manual entry, target < 15 s) is the reason the app is opened. A mobile client whose main action is disabled without a network is not a degraded client — it is a client that does not work. The read-only cache is coherent for a laptop; it is incoherent for the device the user has in hand at the till.
2. **Connectivity in the target market is intermittent, not binary.** In Lomé and comparable markets, the common state is not "offline" but "unreliable": a request that hangs for 20 seconds and then fails. ADR-0008's model (disable buttons while offline) does not cover it — the network *is* declared present. The user taps Save, waits, and loses the entry.
3. **The conflict argument was about balances, and balances are derived data.** A balance is never something the user types. It is computed from transactions (ADR-0003). If the client never transmits a balance, there is no balance to conflict over. That reframing is what makes offline writes tractable, and it was not on the table in July.

## Decision

**The mobile application is offline-first. Every user-facing operation works with no network, including reports and forecasts. The server remains the single source of truth at all times.**

Three structural rules make that compatible with ADR-0004's concern rather than a reversal of it.

### 1. The client sends intents, never state

The client never transmits a computed value — no balance, no budget consumption, no goal progress. It transmits **operations**: "create transaction X on account A", "record repayment Y". The server replays them and recomputes every derived value itself, exactly as it does for an online client. ADR-0003 is untouched: `Account.currentBalanceMinor` is still maintained server-side, in the same SQL transaction.

Consequence: the "which balance wins" scenario that killed offline-first in ADR-0004 cannot arise. No client ever proposes a balance.

### 2. Local state has two planes, never merged in place

| Plane | Content | Writer |
|---|---|---|
| **Replica** | Mirror of server data, per entity | Pull only. The client never edits it. |
| **Outbox** | Ordered log of not-yet-acknowledged local operations | Local writes only. |

Screens read a **projection** = replica + replay of the outbox. A locally created transaction appears instantly with its optimistic effect on the balance; when the server acknowledges it, the outbox entry is dropped and the replica carries the truth. Nothing is ever merged field-by-field on the device.

### 3. Every conflict is surfaced, never resolved silently

There is no last-write-wins, anywhere. An operation the server refuses (stale write, deleted target, failed validation) is parked and shown to the user with both versions. This is the direct application of ADR-0003's principle — *a detected discrepancy is never silently corrected, it signals something that must be seen* — extended to synchronization.

The full protocol, the operation catalogue and the conflict rules are specified in `14-sync-protocol.md`.

### Scope

| Capability | Offline |
|---|---|
| Consultation of the full replicated history | Yes |
| Transaction / transfer entry, edit, delete | Yes |
| Accounts, categories, tags, budgets, goals, recurrences | Yes |
| Debt repayment entry | Yes |
| Reports and forecasts | Yes — computed locally (see `13-mobile-offline-first.md § 6`, and the cost accepted below) |
| File import (CSV/XLSX/OFX) | **No** — server-side parsing (`02-architecture.md § 2`), needs a network |
| Audit log | **No** — never replicated to a device |
| Attachment upload | Queued; the binary is uploaded on reconnection |

## Consequences

**Benefits** — The app's primary journey works everywhere. Latency disappears from the perceived experience: an entry is confirmed locally in milliseconds and synchronized afterwards. And the intermittent-network case, which the read-only cache handles badly, becomes the ordinary case rather than a failure mode.

**Costs, accepted with eyes open**

- **A synchronization engine to build and maintain.** This is the largest single piece of work in the project, exactly as ADR-0004 said. It is accepted for the mobile client and for it alone.
- **Two report implementations.** The server computes reports in aggregated SQL (RG-RP1); the device computes them over SQLite. Two implementations of the same figures is a divergence risk, and the honest mitigation is not discipline but a test: a parity suite runs both against a shared reference implementation and fails CI on any discrepancy (RG-MR3, `13-mobile-offline-first.md § 6`). Any report that cannot be made parity-verified stays server-only and is displayed as requiring a connection. This cost is the direct price of choosing full offline reporting; it is not free and it is not hidden.
- **Financial data at rest on the device.** Mitigated by an encrypted database, a key held in the platform keystore, and a purge on logout (`13-mobile-offline-first.md § 7`).
- **Client versions are no longer uniform.** ADR-0007's decisive benefit — no frozen version at the user's — is lost. An old build stays on a device for months. The API must therefore remain backward compatible, and the protocol carries a minimum supported version with a forced-upgrade path (RG-SY14).
- **Server changes are required**, not just client ones: client-supplied entity ids on creation, a `/sync/changes` endpoint, tombstones exposed on reads. Detailed in `14-sync-protocol.md § 5`.

**Explicitly unchanged**

- ADR-0002 (integer minor units) — enforced identically in the local database.
- ADR-0003 (stored balance, server-side reconciliation) — reinforced: the device never writes a balance.
- ADR-0009 (no human-readable text in the database or the API) — applies to the local database too: it stores `i18nKey` and `params`, never rendered strings.
- **The web front stays as it is**: PWA with a read-only cache (ADR-0008). Offline-first is not retrofitted onto the web. A browser offers neither reliable encrypted storage nor a guarantee against storage eviction, and the desktop journey is consultation and import, not entry under a tunnel. Two clients with different constraints legitimately get different strategies.

## Re-examination

To be reconsidered if the parity suite on reports proves unsustainable (then reports fall back to server-only, without questioning the rest), or if usage shows that offline writes are in practice rare enough not to justify the engine's maintenance.
