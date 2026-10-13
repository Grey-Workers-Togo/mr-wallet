# ADR-0019 — Data minimization for model calls, no stored conversations, content-free traces

## Status
Proposed — 2026-10-13

## Context

Every byte placed in a prompt is sent to the model provider. For a cloud provider, that means a third party, usually outside Togo, receiving personal financial data. Law no. 2019-014 on personal data protection requires that processed data be relevant and proportionate to its purpose. Its authority, the IPDCP, has been operational since March 2025. `07-securite-audit.md` already sets the product's line: strict per-user isolation, log minimization, and no amount, label or email in application logs.

Three places can leak data: the prompt itself, any stored conversation, and observability traces.

## Decision

**Send the model only what the question needs, store no conversation, and trace metadata only.**

### 1. What the provider receives

| Sent | Never sent |
|---|---|
| The question and the last turns of the current session | User identity: name, email, internal id |
| Tool schemas | The raw transaction list |
| Aliases and names of the user's categories and accounts | Internal database identifiers |
| Aggregated tool results; at most 5 labels for `top_expenses` | Phone numbers, including inside SMS sent for fallback extraction |
| For SMS fallback only: the text of one operator SMS, phone numbers masked on the device | SMS from any other sender (never leave the device, ADR-0020) |

### 2. Rules

| Rule | Statement |
|---|---|
| RG-AP1 | No question, answer or prompt is stored in the database. |
| RG-AP2 | Conversation history lives in the client's memory. The client sends at most the last 6 turns. The server is stateless across questions. |
| RG-AP3 | Persisted assistant data is limited to `AssistantUsage` counters (ADR-0022), which contain no text. |
| RG-AP4 | Traces sent to the observability tool contain metadata only: model, token counts, latency per step, estimated cost, tool names, validation outcome, and a pseudonymous user hash (HMAC with a server secret). No question, answer, tool argument value or tool result. |
| RG-AP5 | Full-content traces are permitted only for the synthetic evaluation user, in a non-production environment. |
| RG-AP6 | Application logs follow `07-securite-audit.md`: never a question, an answer, an amount or an SMS. |
| RG-AP7 | A cloud provider is eligible only if its terms exclude training on API data. Its retention period is recorded in `docs/QUESTIONS.md` when it is selected. |
| RG-AP8 | Using the assistant requires an explicit opt-in. The opt-in screen states that questions are processed by an external model provider. |

### 3. The self-hosted alternative

The Ollama adapter (ADR-0017) sends nothing to a third party. Whether it is good enough is an empirical question answered by the benchmark, not a default.

## Consequences

**Benefits**

- The provider never sees who the user is, nor their transaction history.
- No new store of sensitive text is created. There is nothing to purge, export or breach.
- Observability still gives latency, cost and error rates, which is all operations need.

**Costs**

- Conversations are lost on reload. That is acceptable for a consultation assistant, and it is the price of RG-AP1.
- Debugging a bad answer in production cannot rely on its content. Bad answers are reproduced on the synthetic user (RG-AP5) and turned into evaluation cases.
- Category and account names are user-entered and may be revealing. They are sent because tool selection needs them. Users are told so on the opt-in screen.

## Re-examination

If the IPDCP issues guidance on transfers of personal data to AI providers outside Togo, review RG-AP7 and RG-AP8 against it.
