# ADR-0017 — `LlmProvider` port with swappable adapters, no orchestration framework

## Status
Proposed — 2026-10-13

## Context

The assistant (ADR-0016) and SMS capture (ADR-0020) both call a language model. Which model is not settled: it will be chosen by a benchmark on French quality, cost and latency from Lomé, and the choice will be revisited as prices and models move. A self-hosted open model (Ollama) must remain possible for confidentiality reasons (ADR-0019).

Two temptations exist:

1. Call one vendor's SDK directly from the assistant code. The vendor then leaks into business code, and changing it is a refactor.
2. Adopt an orchestration framework (LangChain or similar). It provides agents, chains, memory and tool abstractions. Here, the orchestration is a bounded loop of a few dozen lines. A framework would add a large dependency, its own release churn, and — most importantly — a layer between our code and what is actually sent to the provider. ADR-0019 requires knowing exactly what leaves the server.

A third option was also rejected: **running a model on the phone.** It would remove the network dependency and the transfer of data. But the target devices are often entry- or mid-range: a model small enough to run there would be slow, drain the battery, and answer French questions noticeably worse. What must work offline — SMS extraction (ADR-0020) and rule-based categorization (ADR-0021) — runs on the device without a model. The model is only ever called server-side, through this port.

## Decision

**A cross-cutting `llm` module exposes a single port. Adapters implement it. No orchestration framework.**

### 1. The port

```ts
interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

interface LlmRequest {
  system: string;
  messages: LlmMessage[];          // user / assistant / tool turns
  tools?: ToolSchema[];            // JSON Schema generated from Zod
  responseSchema?: JsonSchema;     // structured output (SMS extraction)
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
}

interface LlmResponse {
  text?: string;
  toolCalls: { id: string; name: string; arguments: unknown }[];
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  model: string;
}
```

`usage`, `latencyMs` and `model` are mandatory: cost accounting and quotas (ADR-0022) depend on them.

### 2. Adapters

| Adapter | Purpose |
|---|---|
| Cloud adapter | The provider selected by the benchmark. One adapter per wire protocol, not per vendor: an OpenAI-compatible adapter covers several vendors. |
| Ollama adapter | A self-hosted open model on infrastructure we control. Reference point for confidentiality. |
| Fake adapter | Scripted responses for tests. No network, no cost, deterministic. |

The adapter is selected by configuration (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_TIMEOUT_MS`), validated at startup like the rest of the environment.

### 3. Rules

| Rule | Statement |
|---|---|
| RG-LL1 | `llm` depends on no other module. Business modules depend on the port, never on an adapter or a vendor SDK. |
| RG-LL2 | Every call carries a timeout and a maximum number of output tokens. |
| RG-LL3 | A transient provider error (timeout, 429, 5xx) is retried once. Anything else surfaces as `LLM_UNAVAILABLE`. |
| RG-LL4 | Tool schemas are generated from the tools' Zod schemas. There is one source of truth for a tool's arguments. |
| RG-LL5 | Orchestration, assistant tests and capture tests run against the fake adapter. Real providers are exercised only by the evaluation harness. |

## Consequences

**Benefits**

- Changing provider or model is a configuration change. The benchmark can run the same evaluation set against several adapters with no code change.
- The full payload sent to a provider is built in our code and inspectable, which ADR-0019 relies on.
- Tests do not depend on a network or a paid API.

**Costs**

- Provider-specific features (prompt caching, batch APIs, parallel tool calls) are only used if the port exposes them. They will be added to the port when a measured need justifies it, not before.
- Normalizing tool-call formats across providers is our code to maintain. It is small, and the fake adapter tests cover it.

## Re-examination

If a future requirement needs genuinely complex orchestration (long-running agents, multi-agent planning), reconsider a framework then. Nothing in the current scope does.
