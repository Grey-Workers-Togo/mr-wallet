# ADR-0018 — Template answers: the model never writes a number

## Status
Proposed — 2026-10-13
**Amends [ADR-0009](0009-internationalisation.md)** for the assistant's generated text only.

## Context

ADR-0016 guarantees that every figure is *computed* by existing code. That is not enough: the model still has to *write* the answer, and a model that copies "23 500" can write "25 300", round it, recompute a percentage, or invent a figure for a tool it did not call. A correct computation followed by a wrong transcription is still a wrong answer.

Two ways to close that gap were considered:

1. **Let the model write figures, then verify.** Extract every number from the answer and check it against tool results. This is fragile: number formats vary (`23 500`, `23.500`, `23k`), percentages may be re-derived, amounts may be spelled out. Each heuristic has false negatives, and a false negative is exactly the failure this ADR exists to prevent.
2. **Never let the model write a figure.** The model writes placeholders; the figures are substituted from tool results. The only check needed is that the text contains no digit outside placeholders — trivial and exact.

A second constraint is ADR-0009: the API never returns human-readable text. An assistant answer is, by nature, generated prose. That must be stated as a bounded exception rather than left implicit.

## Decision

**The model writes a template. Every value in it is a named placeholder bound to a tool result. The client renders the values.**

### 1. Bindings

After each tool call, the orchestrator turns the result into named bindings, each with a type, and gives the model the names and descriptions:

| Type | Payload | Example name |
|---|---|---|
| `money` | `{ amountMinor: string, currency: string }` | `r1.transport` |
| `percent` | `{ basisPoints: number }` | `r1.share_transport` |
| `period` | `{ from: string, to: string }` | `r1.period` |
| `count` | `{ value: number }` | `r2.transactions` |
| `date` | `{ value: string }` | `r3.payoff_date` |

The model answers, for example:

> Ce mois-ci, vous avez dépensé {{r1.transport}} en transport, soit {{r1.share_transport}} de vos dépenses.

### 2. Validation

| Rule | Statement |
|---|---|
| RG-AT1 | An answer contains no digit (`0-9`) outside placeholders. |
| RG-AT2 | Every placeholder refers to a binding produced during the current question. |
| RG-AT3 | An answer does not exceed a maximum length. |
| RG-AT4 | A rejected answer gets exactly one corrective retry. A second rejection produces the deterministic fallback (§ 3), never the rejected text. |
| RG-AT5 | Percentages, differences and any other derived value are computed by a tool or by the orchestrator in integer arithmetic, never by the model. |

### 3. Response shape and fallback

```ts
type AssistantAnswer =
  | { kind: 'template'; template: string; bindings: Record<string, Binding>; sources: SourceRef[] }
  | { kind: 'fallback'; bindings: Record<string, Binding>; sources: SourceRef[] }
  | { kind: 'declined'; code: string; params?: Record<string, string> };
```

`fallback` carries the computed values without prose. The client shows them as a labelled table. The user may receive an incomplete answer, never a wrong figure.

### 4. Rendering and the ADR-0009 exception

The client substitutes bindings and formats them with the `money` kernel and the user's locale, as everywhere else. The template text is the **only** human-readable text the API returns. The exception is bounded:

- the text is generated per request, in `user.locale`, and **never stored** (ADR-0019);
- values are never embedded in the text — they travel structured, as ADR-0009 requires for everything else;
- declined answers use a stable `code`, rendered client-side like any error.

## Consequences

**Benefits**

- Transcription errors become impossible by construction. The guarantee does not depend on how well a given model follows instructions — a model that ignores them is caught by RG-AT1 and degraded to the fallback.
- Formatting stays consistent with the rest of the product (XOF without decimals, locale-specific separators).

**Costs**

- The model works under a writing constraint. Some models will violate it more often than others. The violation rate is a benchmark criterion.
- Numbers spelled out in words ("trois mille") are not caught by RG-AT1. The system prompt forbids them and the evaluation set measures their occurrence. If they appear, a word-number check is added.
- Years in free text ("en 2026") are rejected too. Periods are therefore always placeholders, which is the intended behavior.

## Re-examination

If the fallback rate on the evaluation set exceeds a few percent with the selected model, revisit the system prompt and binding descriptions before relaxing any rule.
