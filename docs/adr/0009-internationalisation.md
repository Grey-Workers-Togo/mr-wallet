# ADR-0009 — French and English from the MVP, no rendered strings in the database

## Status
Accepted — 2026-07-28.
Amended on 2026-09-14 by [ADR-0014](0014-english-as-sole-documentation-language.md), which changes the language of the **documentation** (not of the product): technical documentation, ADRs and commits move to English. The rest of this ADR is unchanged.

## Context

The initial design assumed a French interface, with internationalization "planned" but deferred. In practice, three places were already freezing French into the **data**, not just the display:

1. `Notification.title` and `Notification.body` stored rendered text. A notification created in French stayed French forever, even after a language change.
2. System categories in the seed carried hardcoded French names (`Alimentation`, `Transport`…), inherited by every new user.
3. The API error format returned a French `message` from the server.

These three points are **schema and contract** decisions, not presentation ones. Fixing them before production data exists costs a few hours; afterwards, it takes a data migration over free text, which is never clean.

Moreover, common experience is that an application developed in a single language accumulates hardcoded strings, whatever the discipline claimed: it is the second language that reveals what was missed, not proofreading.

## Decision

**Two complete locales from the MVP: `fr` and `en`.**

Guiding principle, applicable everywhere:

> The database and the API **never** contain text intended to be read by a human in a given language. They carry stable identifiers and parameters. Rendering in a language happens at the last moment, client-side.

Three structural consequences:

| Area | Before | After |
|---|---|---|
| Notifications | `title` and `body` as French text | `type` + `params` (JSON), rendered at display time |
| System categories | Hardcoded French name | Stable `i18nKey` + optional `name` if the user renames |
| API errors | French `message` | Stable `code` + `params`, translated client-side |

### What explicitly stays in a single language

- **Code, identifiers, table and field names**: English, always.
- **Technical documentation and commits**: English (see [ADR-0014](0014-english-as-sole-documentation-language.md); originally French).
- **Data entered by the user** (transaction labels, account names, notes): it is in the user's language and is never translated. It is their data, not interface.

### Separation of language / currency / timezone

These three dimensions stay independent, as they already were: `user.locale`, `user.baseCurrency`, `user.timezone`. A user can read the interface in English, count in XOF and live in Cotonou. Linking them would be a frequent and costly mistake.

## Consequences

**Benefits**

- Changing language updates the whole interface, including notification history.
- Adding a third language becomes pure translation work, with no schema or API change.
- The error-code format is better API practice anyway: it makes errors testable and interpretable by a client, which a natural-language message is not.

**Costs**

- Two translation files to maintain in parallel from the first screen onward. An automated key-parity check is necessary (see `10-conventions-dev.md`).
- Client-side notification rendering assumes the client knows every type. A notification of an unknown type (out-of-date client) must have a fallback rendering, never an empty screen.
- Pluralization and word order differ between languages: messages must be complete parameterized sentences, never concatenated fragments.

**Two known debts, accepted**

They are not fixed now because they do not touch the schema and stay repairable at any time:

1. **Export file headers** (`date_operation`, `compte`…) — frozen in French in `06-import-export.md`. An English-speaking user will receive a CSV with French headers. Fixable by following `user.locale` at generation time, with no migration.
2. **`Currency.name`** — stores a readable label ("Franc CFA"). Since the ISO code is itself the key, the client can resolve the name from its own dictionary and ignore the field. No data to migrate.

Flagging them here avoids their being discovered later as inconsistencies.

**Out of scope for now**

RTL (Arabic, Hebrew) is not planned. If such a language ever arrives, using logical CSS properties (`margin-inline-start` rather than `margin-left`) from now on will limit the cost — a free convention to adopt, not a project.

## Re-examination

A third language will not require a new ADR as long as it is LTR. An RTL language will.
