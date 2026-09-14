# ADR-0014 — English as the sole documentation language

## Status
Accepted — 2026-09-14
Amends [ADR-0009](0009-internationalisation.md) on one point: the language of the documentation. The product's bilingual interface (`fr` + `en`) is **unchanged**.

## Context

ADR-0009 settled the product's languages and, in passing, set technical documentation and commits in French. The repository then drifted from that: the numbered documents came to exist as pairs — `NN-name.md` in English and `NN-name_fr.md` in French — while the ADRs stayed French only, and `10-conventions-dev.md § 1` kept stating "Documentation, commits: French".

Three sources of truth for the same sentence, disagreeing. That is the actual problem, not the choice of language: a document that exists twice will diverge, and here it already had. The English and French halves of the numbered documents were no longer in step.

Two secondary considerations pointed the same way. Code, identifiers, error codes and `i18nKey` values are already English (ADR-0009), so French documentation forces a translation step on every reader who has to connect a rule to the symbol implementing it. And the project may involve contributors who do not read French, while the reverse is not true.

## Decision

**English is the only documentation language.** This covers technical documentation, ADRs, commit messages, code comments, `QUESTIONS.md` and design specifications.

- The `*_fr.md` twins are deleted. They are not replaced by anything: a translation that nobody is accountable for keeping in step is worse than no translation.
- The existing French ADRs (0001–0009) are translated into English in place, keeping their numbers **and their file names**. ADR file names are identifiers, cross-referenced from a dozen documents; renaming them for cosmetic reasons would break those links for no gain. Their French slugs are residue, and accepted as such.
- `10-conventions-dev.md § 1` is corrected.

### What this does not change

- **The product stays bilingual**, `fr` and `en`, with everything ADR-0009 requires: no rendered text in the database or the API, key parity checked in CI, ICU pluralization.
- **Data entered by the user** stays in their language and is never translated.
- **The `fr.json` translation file** is a product artifact, not documentation. It obviously stays French.

## Consequences

**Benefits** — One document per subject. No divergence possible between two versions of the same rule, because there are no longer two. Documentation and code share a vocabulary: a rule and the symbol implementing it are written the same way.

**Costs**

- **A translation pass to absorb**, done at the moment of this decision for ADRs 0001–0009.
- **French-speaking readers lose a version in their language.** The trade is deliberate: a stale French version is not a service to them. Anyone who needs French can translate on the fly, from a source that is at least correct.
- **Half-French ADR file names persist.** Accepted, for the link-stability reason above. To be re-examined only if a renaming pass is done for another reason anyway.

## Re-examination

To be reconsidered if the project gains contributors or users for whom French documentation is a genuine requirement — in which case the right answer is a translation with an owner, not a duplicate maintained by goodwill.
