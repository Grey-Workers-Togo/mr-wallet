# ADR-0011 — Expo / React Native for the mobile application

## Status
Accepted — 2026-09-03
Implements the client decided in [ADR-0010](0010-offline-first-mobile.md).

## Context

ADR-0010 requires a native mobile client covering iOS and Android, offline-first, whose local engine must apply *exactly* the same financial arithmetic as the server. That last constraint dominates the choice: the `money` kernel (ADR-0002) and the Zod validation schemas in `packages/contracts` are the definition of correctness for amounts. Any technology that cannot execute them must re-implement them.

Three options were weighed:

| Option | Shares `packages/contracts` | Notes |
|---|---|---|
| **Expo / React Native** | Yes, as-is | Same language as API and web. Native modules for encrypted SQLite, keystore, biometrics. |
| **Flutter + Drift** | No | Better UI performance and a more predictable runtime, but the `money` kernel, the Zod schemas and the report reference implementation must be rewritten in Dart. |
| **Kotlin Multiplatform + Compose** | No | Shared logic in Kotlin, native UI on both sides. Highest start-up cost, furthest from the rest of the project. |

Flutter's rewrite cost is not measured in days of work — it is measured in the permanent existence of **a second source of truth on financial arithmetic**. Rounding on a 0-decimal currency, amortization schedules, period boundaries in the user's timezone: each would exist twice, and only a cross-language test suite would keep them equal. ADR-0010 already accepts one such duplication (reports in SQL vs SQLite) and pays for it with a parity suite. Accepting a second, across the whole domain, is a different order of risk.

## Decision

**Expo (managed workflow, development builds) with React Native and TypeScript.**

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Expo SDK + React Native | Single language across API, web and mobile; `packages/contracts` imported unchanged. |
| Navigation | Expo Router | File-based routing, mirrors the Next.js structure already used on the web. |
| Local database | **SQLite via `op-sqlite`**, with SQLCipher enabled | Synchronous JSI bindings, native 64-bit integer support (mandatory for `BigInt` minor units, ADR-0002), at-rest encryption without a separate layer. |
| Local query layer | **Drizzle ORM** (SQLite dialect) | Typed schema, versioned migrations, and above all readable raw SQL for report queries — which must stay legible next to their Postgres counterpart for the parity review. |
| Server state | TanStack Query, persisted | Same library as the web; here it caches the *sync* layer, it is not the offline store itself. |
| Local UI state | Zustand | Light; the heavy state is in SQLite. |
| Secure storage | `expo-secure-store` (Keychain / Keystore) | Holds the database key and the refresh token. |
| Biometrics | `expo-local-authentication` | Available natively, unlike on the PWA (ADR-0007 had made the PIN the fallback). |
| Push | `expo-notifications` (APNs / FCM) | Removes ADR-0007's known iOS Web Push limitation. |
| i18n | `i18next` + ICU | Same keys and same message files as `next-intl` on the web (ADR-0009); the format is compatible, the files are shared. |
| Charts | `victory-native` (Skia) | Recharts is DOM-bound and does not apply. |
| Build / release | EAS Build + EAS Update | Bugfixes on the JS layer ship without store review, which softens ADR-0010's "frozen client version" cost — without eliminating it, since native changes still require review. |
| Tests | Vitest (domain), Maestro (e2e flows) | The sync engine and local reports are tested as pure TypeScript, without a device. |

### Non-negotiable constraint carried over

`BigInt` must survive the whole chain: SQLite `INTEGER` (64-bit signed) → op-sqlite binding → `money` kernel. **No amount ever passes through `Number`, on the device any more than on the server** (ADR-0002). A lint rule and a test on an amount exceeding 2^53 guard this on the mobile side.

## Consequences

**Benefits** — One language, one contracts package, one set of validation schemas. The `money` kernel, the Zod schemas, the error codes and the translation files are shared rather than duplicated. A developer moves between API, web and mobile without a context switch. Native APIs (biometrics, real push, background sync) close ADR-0007's known gaps.

**Costs**

- React Native's UI performance is below Flutter's on long lists; the transaction list needs `FlashList` and disciplined virtualization.
- Expo's managed workflow constrains which native modules can be used; `op-sqlite` and SQLCipher require a development build, not Expo Go. This must be set up at lot M0, not discovered later.
- The Expo SDK follows its own upgrade cadence; a yearly upgrade is real maintenance work, to be planned rather than suffered.
- Flutter is a familiar stack that is being set aside here. The trade is deliberate: UI comfort against a single source of truth on money.

## Re-examination

To be reconsidered if measured UI performance on the transaction list proves unacceptable after optimization, or if the Expo dependency becomes a blocker on a required native capability.
