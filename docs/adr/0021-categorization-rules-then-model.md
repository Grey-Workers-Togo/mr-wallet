# ADR-0021 — Categorization of captured transactions: rules first, model suggestion second, user confirms

## Status
Proposed — 2026-10-13

## Context

Captured transactions (ADR-0020) arrive without a category. The product already has deterministic categorization: `CategorizationRule`, evaluated by descending priority, first match wins (RG-T8), on description, payee or external reference. Rules are transparent and free, but users rarely write them up front, and they miss new labels.

A language model can suggest a category for an unseen label. It can also invent categories, guess with unwarranted confidence, and needs a network.

The rule matcher (`ruleMatches` in `apps/api/src/modules/rules/domain/match-rule.ts`) is a pure function. The capture app must categorize offline (RG-CP8), so it needs the same matcher.

## Decision

**Rules decide when they match. Otherwise the model may suggest one of the user's existing categories. The user always confirms, and a correction can become a rule.**

### 1. Order of decision

1. Evaluate the user's active rules, by priority (RG-T8). A match sets the category.
2. If no rule matches and the device is online, call `POST /capture/categorize`. The model receives the normalized label, the operation type and direction, the merchant name for merchant payments, and the user's category aliases. It must return one alias or `none`.
3. Otherwise, leave the transaction uncategorized.
4. The user sees the category with its origin (rule, suggestion, none) and may change it.
5. When the user changes a suggested or missing category, the app offers to create a rule, pre-filled from the transaction (`PAYEE EQUALS` for a merchant, `DESCRIPTION CONTAINS` otherwise).

### 2. Rules

| Rule | Statement |
|---|---|
| RG-CT1 | A matching user rule always wins over a model suggestion. |
| RG-CT2 | The model may only return an existing category alias or `none`. It never creates a category. An unknown alias is treated as `none`. |
| RG-CT3 | For person-to-person transfers, the counterparty's name is not sent to the model, only the operation type and direction. |
| RG-CT4 | A suggestion is never applied silently. It is shown as a suggestion until the user confirms the transaction. |
| RG-CT5 | The pure matcher moves to `packages/contracts` so that the API and the capture app run the same code (RG-RE1). The capture app caches the user's active rules when online. |

## Consequences

**Benefits**

- Existing rules keep working unchanged and take precedence.
- The model is used less as the user corrects suggestions, because corrections become rules. Cost decreases with use.
- Offline categorization is possible for every label a rule covers.

**Costs**

- Moving the matcher is a small refactor of the `rules` module, covered by its existing tests.
- Model suggestions may be wrong. That is acceptable because RG-CT4 keeps the user in the loop; the acceptance rate is measured.

## Re-examination

If the acceptance rate of model suggestions is low, drop step 2 and rely on rule suggestions from history (the recurrence-detection approach of `04-modules.md`).
