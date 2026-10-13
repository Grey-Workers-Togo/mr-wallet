# 17 — Assistant and SMS capture roadmap

Implementation order for the conversational assistant and SMS capture ([ADR-0016](adr/0016-assistant-tools-over-existing-reports.md) to [ADR-0022](adr/0022-assistant-availability-and-cost.md)).

Numbered `A0`–`A5`, one week each, alongside the `09` / `12` / `15` numbering. Same rules as the other roadmaps: lots are **sequential**, each ends functional and tested, definition of done per `10-conventions-dev.md`. Estimates are for one developer.

Work happens on `feat/assistant`. Every lot is mergeable on its own because everything is behind `ASSISTANT_ENABLED` / `CAPTURE_ENABLED` (ADR-0022 § 5).

Research material (SMS corpus, question set, synthetic user, measurement harness) lives in the private repository `mr-wallet-assistant-research` (RG-CP7). Tasks there are marked **[research]**.

## Prerequisites, started in week 1 and running in parallel

- **[research] Collect real operator SMS** — Flooz and Mixx by Yas, every operation type, with written consent, anonymized per `corpus/sms/README.md`. Lot A3 cannot start without the `dev` split.
- **Confirm operator sender addresses** on real devices (`docs/QUESTIONS.md`).
- **Shortlist 3–4 models** for the benchmark, including one open model served by Ollama.

---

## A0 — Foundations (week 1, `apps/api` only)

No endpoint, no UI. Everything is tested against the fake adapter.

- `llm` module: `LlmProvider` port, request/response types, environment schema (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_TIMEOUT_MS`, prices per model).
- Adapters: OpenAI-compatible (covers the cloud candidates and Ollama), fake (scripted responses). Timeout, max output tokens, one retry on transient errors (RG-LL2, RG-LL3).
- Tool schemas generated from Zod (`z.toJSONSchema`, Zod 4) (RG-LL4).
- `assistant` module skeleton: `ToolDefinition`, `ToolRegistry` with argument validation (RG-AS2), alias mapper for categories and accounts.
- `PeriodResolver`: symbolic periods → UTC bounds in `users.timezone`. Tests on month boundaries across timezones.
- Template validator (RG-AT1–AT3) and binding types. Tests include digits in every position, unknown placeholders, spelled-out numbers (documented gap).
- Orchestrator loop: tool rounds bounded at 3, one corrective retry, deterministic fallback (RG-AS4, RG-AT4).
- **[research]** Synthetic user generator: 6 months, 3 accounts (mobile money, bank, cash), budgets, one goal, one debt, XOF. Deterministic seed.

**Exit criterion**: a scripted question runs end to end through the orchestrator with the fake adapter — tool call, binding, template, validation, fallback on a forced violation. `npm run lint && npm run typecheck && npm run test` pass.

---

## A1 — Consultation assistant (week 2)

- `ReportingFacade`: add pass-throughs for `spendingByCategory`, `monthlySummary`, `cashflow`, `comparison`, `topTransactions`, `budgetVsActual`. Existing report tests unchanged.
- The 11 tools of ADR-0016, each with its Zod schema, result → bindings mapping, and a multi-user isolation test (RG-AS6).
- `POST /assistant/ask`: question ≤ 500 characters, history ≤ 6 turns (RG-AP2), auth, throttling, flags and allowlist, error codes (`ASSISTANT_DISABLED`, `ASSISTANT_QUOTA_EXCEEDED`, `LLM_UNAVAILABLE`, declined reasons).
- Migration: `AssistantUsage` table (reversible). Quotas and cost accounting (RG-AQ1–AQ3). In-memory answer cache keyed on data version (ADR-0022 § 3).
- System prompt (French), tool descriptions, declined categories (writes, advice, unrelated).
- Metadata-only traces to Langfuse (RG-AP4).
- `apps/web`: opt-in screen (RG-AP8), assistant panel, template rendering with the `money` kernel, sources, fallback table, disabled offline. Keys in `fr` and `en`.
- API docs: `05-api.md` (endpoint), `03-modele-donnees.md` (`AssistantUsage`).

**Exit criterion**: on a test instance seeded with the synthetic user, ten representative questions are answered from the web app with correct figures. A forced template violation shows the fallback table. Airplane mode disables the panel.

### A1.1 — Review follow-up (before A2)

Decisions taken on reviewing A1; none changes an existing endpoint or screen.

- History without values: an answer goes back as its template; the server refuses a turn carrying a figure (RG-AP9).
- Server-side consent: `User.assistantOptInAt`, `PUT`/`DELETE /assistant/opt-in`, `ASSISTANT_OPT_IN_REQUIRED` (RG-AP3, RG-AP8 amended).
- `/assistant` throttled per user, not per IP (RG-AQ4).
- Assistant figures exclude reconciliation adjustments and roll subcategories into their parent, through additive report options.

---

## A2 — Evaluation and provider selection (week 3)

- **[research]** Question set: ~100 annotated questions, split `dev` / `test`. Expected values computed by hand-written SQL, independently of the assistant.
- **[research]** Harness: runs the set over HTTP against the test instance, computes exactness, tool selection, template violations, refusals, latency p50/p95, cost.
- **[research]** E1: same questions to a model given the raw transaction history of the synthetic user, computing itself.
- **[research]** E2: benchmark of the shortlisted models on the `dev` split, from a machine in Lomé.
- Tune the system prompt and tool descriptions on `dev` only.
- Select the provider. Record its training and retention terms in `QUESTIONS.md` (RG-AP7). Set initial quotas from the measured cost per question.
- Move ADR-0016 to ADR-0019 and ADR-0022 to *Accepted*, or amend them with what the measurements showed.

**Exit criterion**: `results/` holds E1 and E2 summaries with the commit, model and dataset versions. Provider chosen and configured.

---

## A3 — SMS capture on the device (week 4)

- `packages/sms-parsers`: sender whitelist, one parser per operator and operation type, written against the `dev` split; phone-number masking. Tests in this repository use **synthetic** messages reproducing the formats (RG-CP7).
- Move the rule matcher to `packages/contracts` (RG-CT5). `rules` module tests unchanged.
- In one commit (RG-SY5, RG-CP5): optional `source` and `externalRef` on `transaction.create` in `packages/sync-protocol`, API handler, `TxSource.SMS` migration, deduplication on the operator reference (RG-CP6). Doc: `14-sync-protocol.md`.
- `apps/capture`: Expo development build, Android only. Sign-in with tokens in secure storage. Kotlin native module (Expo Modules API): inbox query and `SMS_RECEIVED` receiver, whitelist applied natively (RG-CP1). Review list (RG-CP2). Local outbox pushing through `/sync/push` with client-generated UUIDv7 ids.
- CI: build `apps/capture` when `packages/*` changes (RG-RE2).

**Exit criterion**: on a real Android phone, in airplane mode, a received Flooz SMS appears for review, is confirmed, and is pushed on reconnection. It appears exactly once in the web app, even if the SMS is processed twice.

---

## A4 — Fallback extraction and categorization (week 5)

- `capture` module: `POST /capture/extract` — structured output, Zod validation, consistency checks, nothing stored, content-free fallback counter (RG-CP3, RG-CP4).
- `POST /capture/categorize` — rules first, then model constrained to existing aliases or `none`, no person name for P2P transfers (RG-CT1–CT3).
- `apps/capture`: fallback and suggestion queue when offline (RG-CP8). Suggestion display. Correction → pre-filled rule creation.
- `apps/web`: paste an SMS (ADR-0020 § 4).
- Play Console: permission declaration for "SMS-based money management", privacy policy update, internal testing track build.
- **[research]** E3 (rules / model / hybrid) and E4 (rules / rules + model) on the `test` splits.

**Exit criterion**: an SMS with an unknown wording is extracted through the fallback and flagged incomplete when a check fails. Categories are suggested and a correction creates a rule. E3 and E4 summaries in `results/`.

---

## A5 — Final evaluation and staged rollout (week 6)

- E5: full existing test suite, isolation tests, and an automated audit of payloads sent to the provider for the synthetic user — no raw transaction list, no phone number (H2).
- Final E1 / E2 run on the `test` split with the selected model.
- Rollout per ADR-0022 § 5: evaluation user → volunteers → everyone, watching latency, cost and fallback rate.
- Docs: `03`, `05`, `14` up to date. Remaining ADRs moved to *Accepted*.

**Exit criterion**: assistant and capture enabled in production behind flags, final results committed, no regression.

---

## Risks and what gets cut first

| Risk | Mitigation | If it materializes |
|---|---|---|
| Too few real SMS by week 4 | Collection starts week 1 | Write parsers for the operation types collected; extend later |
| Play refuses the SMS permission | Declaration filed in A4; ADR-0020 § 4 | Paste/share in the web app becomes the primary channel |
| Latency from Lomé above target | Measured in A2; cache; shorter prompts | Pick a faster model; accept and document the gap |
| Native module takes longer than a week | Kotlin scope limited to read + receive + whitelist | Ship inbox import on demand first, live receiver later |
| Schedule slip | Lots are independent behind flags | Cut in this order: model categorization (A4), web paste (A4), Ollama in E2 |
