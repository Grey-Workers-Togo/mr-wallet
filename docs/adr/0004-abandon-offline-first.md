# ADR-0004 — Dropping offline-first

## Status
**Superseded for the mobile client — 2026-09-03** by [ADR-0010](0010-offline-first-mobile.md), which adopts offline-first on mobile.

Still **in force for the web front**: the web is a PWA with a read-only consultation cache; it buffers no writes.

History: qualified by [ADR-0008](0008-cache-lecture-seule.md), which added the offline consultation cache without permitting writes.

## Context
Offline-first was considered for a usage context with irregular connectivity. It implies a local database, a bidirectional synchronization engine, local schema versioning, and above all a conflict-resolution strategy for when two devices modify the same data offline. On financial data, a badly resolved conflict produces a wrong balance.

## Decision
A conventional connected application (client/server). No synchronized local database.

## Consequences
- **Benefit**: removal of the project's most complex piece of work, data consistency guaranteed by PostgreSQL, a markedly faster time to market.
- **Cost**: the application is unusable without a connection. To be offset by good latency tolerance: pagination, progressive loading, explicit loading states, automatic retry.
- **Reversible**: a read-only cache (PWA) remains conceivable without questioning the architecture; offline writes do not. That is precisely what ADR-0008 settled.
