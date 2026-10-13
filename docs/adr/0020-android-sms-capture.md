# ADR-0020 — Android capture app and hybrid SMS extraction

## Status
Proposed — 2026-10-13
**Amends [ADR-0013](0013-native-ingestion-channels.md) § 3** on message content leaving the device.
Consistent with [ADR-0012](0012-mobile-in-the-existing-monorepo.md): the app lives in this monorepo.

## Context

ADR-0013 identifies automatic reading of operator transaction SMS as "the largest single improvement available to this product", and lists three risks: Android permission policy, iOS impossibility, and the sensitivity of reading messages. It makes SMS reading "a spike before it is a lot", whose first deliverable is an answer on eligibility.

That answer now exists. Google Play's policy on SMS and Call Log permissions lists **"SMS-based money management"** among the permitted exceptions for apps that are not the default SMS handler, covering `READ_SMS` and `RECEIVE_SMS`, with budgeting apps as the example. It remains subject to review, and the policy forbids budgeting apps from exfiltrating non-financial or personal SMS.

The full mobile client of ADR-0010/0011 (`15-roadmap-mobile.md`, lots M1–M8) is not started and represents several months of work. The server side of synchronization (M0) is done: `/sync/push` accepts `transaction.create` with a client-supplied id and is idempotent.

Operator SMS are short and highly regular. Hand-written rules extract them reliably and offline — until an operator changes its wording. A language model extracts any wording, but needs a network and sends text to a provider.

## Decision

**A minimal Android app, `apps/capture`, reads operator SMS, extracts transactions with rules on the device, falls back to the model on the server for unrecognized messages, and pushes user-confirmed transactions through the existing sync protocol.**

### 1. Components

| Component | Responsibility |
|---|---|
| `apps/capture` | Expo app, Android only. Sign-in, permission onboarding, list of detected transactions to review, local outbox. |
| Native module (Kotlin, Expo Modules API) | Reads the SMS inbox and listens for new messages. Filters on the sender whitelist **before** anything crosses into JavaScript. |
| `packages/sms-parsers` | Pure TypeScript. Sender whitelist, one parser per operator and operation type (send, receive, withdrawal, deposit, merchant payment, airtime), phone-number masking. Used by the app and the API. |
| `capture` module (API) | `POST /capture/extract` (model fallback) and `POST /capture/categorize` (ADR-0021). |

### 2. Flow

1. A whitelisted SMS arrives. Non-whitelisted messages are never read beyond the sender address.
2. `sms-parsers` extracts a candidate: amount in minor units, direction, counterparty, fee, operator date, operator reference, announced balance.
3. If no parser matches, the app masks phone numbers and, when online, calls `/capture/extract`. The server asks the model for structured output, validates it with Zod, and runs consistency checks: the extracted amount appears in the text, and the announced balance is arithmetically consistent when present. A candidate that fails a check is returned as incomplete, to be completed by hand.
4. The user reviews every candidate: confirm, edit or ignore (RG-I1).
5. Confirmed candidates enter the local outbox and are pushed as `transaction.create` operations through `/sync/push`.

### 3. Rules

| Rule | Statement |
|---|---|
| RG-CP1 | Only messages from whitelisted operator senders cross the native boundary. Others are neither read nor transmitted. |
| RG-CP2 | No transaction is created from an SMS without user confirmation (RG-I1 applies to every automatic channel). |
| RG-CP3 | An SMS leaves the device only for fallback extraction, only if it is from a whitelisted sender, with phone numbers masked on the device, and it is never stored server-side. |
| RG-CP4 | Fallback extractions are counted (without content) so that a recurring unrecognized format triggers a new parser. The fallback is a safety net, not the normal path. |
| RG-CP5 | `transaction.create` gains two optional fields, `source` (`SMS`) and `externalRef` (operator reference), in `packages/sync-protocol` and in the API handler in the same commit (RG-SY5). `TxSource` gains `SMS`. |
| RG-CP6 | A given operator reference produces at most one transaction per user and account. |
| RG-CP7 | Real SMS samples are never committed to this repository, which is public. Parser tests use synthetic messages that reproduce the formats. The real, anonymized corpus lives in a separate private research repository. |
| RG-CP8 | Detection, rule-based extraction, rule-based categorization and confirmation work offline. Fallback extraction and model suggestions wait for the network. |

### 4. Fallback channel when automatic reading is unavailable

If Play review refuses the permission, or on iOS, the same flow starts from text the user pastes or shares into the web app: `/capture/extract` accepts it, and the rest is unchanged.

### 5. Relation to the future mobile client

`apps/capture` is deliberately narrow. When `apps/mobile` is built, capture becomes one of its screens and `apps/capture` is retired. Because both use `sms-parsers` and `sync-protocol`, nothing is rewritten.

## Consequences

**Benefits**

- Manual entry disappears for the dominant operation type of the primary market, which ADR-0005 identifies as the main cause of drop-off.
- Most messages are handled on the device, offline and at no model cost.
- `apps/capture` is the first real client of the sync protocol, which validates M0 against an actual consumer before the full mobile client.

**Costs**

- **Store review.** The exception must be justified in the Play Console declaration, with a real chance of delay or refusal. § 4 is the fallback.
- **Parser maintenance.** Operators change formats without notice. RG-CP4 makes that visible; writing the new parser stays manual.
- **ADR-0013 is amended.** It required that no message content ever leave the device. RG-CP3 narrows the exception to its minimum: operator messages only, masked, transient, and only when rules fail.
- **Platform asymmetry**, already accepted by ADR-0013: Android only.

## Re-examination

If the fallback rate stays near zero on real traffic, consider removing model fallback entirely and keeping messages strictly on the device. If Play refuses the permission, § 4 becomes the primary channel.
