# ADR-0022 — Assistant availability, caching, quotas and cost bounds

## Status
Proposed — 2026-10-13

## Context

A model call costs money, takes seconds, and needs a network. The product's users are in a market with limited purchasing power and unreliable connectivity (`01-vision-perimetre.md § 7`). Unbounded usage — a loop of tool calls, a user scripting requests, a provider price change — turns directly into cost. OWASP's Top 10 for LLM Applications lists unbounded consumption and excessive agency among the main risks.

The product is in production. The assistant and the capture endpoints must be introduced without risk to existing users.

## Decision

### 1. Availability

| Situation | Behavior |
|---|---|
| Web app offline | The assistant panel is disabled with an explanation. Cached consultation (ADR-0008) remains available. |
| Capture app offline | Detection, rule extraction, rule categorization and confirmation work. Fallback extraction and suggestions are queued and retried on reconnection (RG-CP8). |
| Provider unavailable | `LLM_UNAVAILABLE` (RG-LL3). The rest of the product is unaffected. |

### 2. Bounds per question

| Bound | Initial value |
|---|---|
| Tool-call rounds (RG-AS4) | 3 |
| Corrective retries for a rejected template (RG-AT4) | 1 |
| Maximum output tokens per call | Configured per model |
| End-to-end timeout | 20 s |

### 3. Cache

Answers are cached in memory for 10 minutes. The key is `(userId, normalized question, data version)`, where the data version is the most recent `updatedAt` across the user's financial entities, read through the existing `(userId, updatedAt, id)` indexes. Any write invalidates by construction. Nothing is persisted.

### 4. Quotas and cost accounting

A table `AssistantUsage(userId, day, requests, inputTokens, outputTokens, estimatedCostMicros)` holds counters and no text (RG-AP3).

| Rule | Statement |
|---|---|
| RG-AQ1 | A daily per-user question quota applies (configurable). Beyond it, the assistant answers `ASSISTANT_QUOTA_EXCEEDED`. |
| RG-AQ2 | A global monthly cost ceiling applies. When reached, the assistant answers `ASSISTANT_DISABLED` until the next period. Capture fallback is subject to the same ceiling. |
| RG-AQ3 | Estimated cost is computed from `usage` (ADR-0017) and a configured price per model. |
| RG-AQ4 | The existing API throttling applies on top of quotas. |

### 5. Staged rollout

`ASSISTANT_ENABLED` and `CAPTURE_ENABLED` flags, plus a per-user allowlist, gate the new endpoints. Rollout order: the synthetic evaluation user, then volunteer users, then everyone. All schema changes are additive and reversible: one enum value (`TxSource.SMS`), one table (`AssistantUsage`), optional sync fields.

## Consequences

**Benefits**

- The worst-case monthly cost is known in advance and cannot be exceeded.
- A provider outage or a cost overrun degrades the assistant only, never entry or reports.
- The rollout can be stopped at any stage by configuration.

**Costs**

- An in-memory cache is per instance and lost on restart. That is acceptable at the current scale, which runs a single API instance.
- Quotas can frustrate heavy users. Initial values are set from the benchmark's cost per question and adjusted from observed usage.

## Re-examination

If several API instances are deployed, move the cache to a shared store. If observed cost per active user is far below the ceiling, raise the quota before anything else.
