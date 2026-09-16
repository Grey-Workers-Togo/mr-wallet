# ADR-0012 — The mobile application lives in the existing monorepo

## Status
Accepted — 2026-09-03
Follows from [ADR-0010](0010-offline-first-mobile.md) and [ADR-0011](0011-stack-mobile-expo-react-native.md).

## Context

The question is whether `apps/mobile` joins the existing repository (`apps/api`, `apps/web`, `packages/contracts`) or lives in a repository of its own.

The instinct for a separate repository is understandable: a mobile app has its own release cadence, its own build tooling, its own store constraints, and none of that concerns the web front. But the coupling here is not organizational, it is semantic. Three artifacts are **shared definitions of correctness**, not shared utilities:

1. **The `money` kernel** — if the device and the server round differently, balances diverge. This is the failure mode ADR-0004 feared.
2. **The Zod schemas of `packages/contracts`** — the client validates an operation locally *before queuing it*, precisely so that a queued operation is not rejected three hours later. That local validation is only worth something if it is byte-identical to the server's.
3. **The sync protocol** — the operation catalogue, the payload shapes and the error codes of `14-sync-protocol.md` are a contract between two codebases that must change together.

In two repositories, all three become a published-package dependency: a version to bump, a publication step, a window during which the two sides disagree. The offline case makes that window costly, because a client that disagrees with the server does not fail immediately — it fails at synchronization time, on data the user has already entered and believes is saved.

## Decision

**A single monorepo. The mobile application is `apps/mobile`.**

```
mr-wallet/
├── apps/
│   ├── api/            # NestJS
│   ├── web/            # Next.js (PWA, ADR-0007/0008)
│   └── mobile/         # Expo / React Native (ADR-0011)
├── packages/
│   ├── contracts/      # Zod schemas, shared types, money kernel
│   ├── sync-protocol/  # operation catalogue, sync DTOs, error codes
│   └── analytics-core/ # pure reference implementation of reports (RG-MR3)
└── docs/
```

Two packages are extracted from what exists today, because ADR-0010 gives them a second consumer:

- **`packages/sync-protocol`** — operation names, their payload schemas, the sync request/response envelopes, the conflict codes. Imported by the API and by the mobile app. Neither side may define an operation the other does not know about.
- **`packages/analytics-core`** — the pure TypeScript reference implementation of every report and forecast. It is not what runs in production on either side (the server runs Postgres SQL, the device runs SQLite SQL) — it is **the oracle both are tested against**. It is what makes ADR-0010's accepted duplication verifiable rather than merely hoped for.

### Rules

| Rule | Statement |
|---|---|
| RG-RE1 | `apps/mobile` never imports from `apps/web` or `apps/api`. Anything shared moves to `packages/`. |
| RG-RE2 | A change to `packages/contracts` or `packages/sync-protocol` triggers CI on the API and on the mobile app. A red mobile build blocks the merge, exactly like a red API build. |
| RG-RE3 | The report parity suite (server SQL / device SQL / `analytics-core`) runs on every pull request touching any of the three. |
| RG-RE4 | The mobile app has its own release cycle and its own version numbering. Being in the same repository couples the *source*, not the *releases*. |
| RG-RE5 | Since store releases are not immediate, the API stays compatible with the **two** most recent published mobile versions at minimum. Below that floor, the protocol returns `CLIENT_TOO_OLD` and the app shows a forced-upgrade screen (RG-SY14). |

## Consequences

**Benefits** — A protocol change is one atomic commit across server and client, reviewed together and tested together. No package publication step, no version drift on the definitions that guarantee correctness. One CI, one lint configuration, one set of conventions (`10-conventions-dev.md`) applied everywhere.

**Costs**

- **Heavier CI.** Native builds (EAS) are slow. Mitigation: build jobs are conditioned on affected paths; only the shared packages force a full run.
- **A bigger repository**, and a mobile developer clones the API and the web front they will not open. Acceptable at this scale.
- **Illusory coupling risk.** Sharing a repository makes it tempting to import anything from anywhere. RG-RE1 exists for exactly that, and needs a lint rule on cross-app imports — the same discipline ADR-0001 already requires between back-end modules.
- **Tooling frictions**: Metro (React Native's bundler) and the workspace symlinks of a monorepo need explicit configuration. A known problem with known solutions, to be settled at lot M0.

## The counter-case, stated fairly

A separate repository would be the right answer if the mobile app were built by a distinct team, on a different cadence, against a **frozen, versioned public API**. That is not the situation: the API is being developed alongside, and ADR-0010 introduces a protocol whose two sides must evolve in step. If those conditions change — a stable v1 API, a separate team — extracting `apps/mobile` remains cheap, precisely because the sharing already goes through explicit packages rather than relative imports.
