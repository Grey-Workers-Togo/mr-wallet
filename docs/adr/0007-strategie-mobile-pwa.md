# ADR-0007 — Mobile via an installable PWA, no native application

## Status
**Superseded — 2026-09-03** by [ADR-0011](0011-stack-mobile-expo-react-native.md): a native Expo / React Native application is added, decided by [ADR-0010](0010-offline-first-mobile.md).

The installable PWA is **not removed**: it remains the web client, with its consultation cache (ADR-0008). What changes is that it ceases to be the *only* mobile strategy.

The re-examination clause at the end of this document did its job: it is the reason for this change. The rule it imposed — all reusable business logic lives in `packages/contracts` or in `domain/` folders, never in a React component — is what made the transition affordable, and it stays in force.

## Context

The API designed in ADR-0001 is already client-agnostic: REST/JSON, stateless `Bearer` authentication, cursor pagination, idempotency keys, an aggregated endpoint for the dashboard. A mobile client would consume it without modification. The question therefore concerns only the **client**.

Three options were on the table:

1. **Installable PWA** — a single Next.js front, rendered responsively and installable on the home screen.
2. **React Native in V2** — the web stays on Next.js, a native application is added after the MVP.
3. **Mobile-first** — React Native first, web afterwards.

Next.js's React presentation code is **not** reusable in React Native. Only shared logic (`packages/contracts`: Zod schemas, types, the `money` kernel) is. A native application is therefore a second front to build and maintain, not an adaptation of the first.

## Decision

**Installable PWA.** A single Next.js front, designed responsive-first (mobile is the reference width, not an afterthought), with an application manifest, a service worker and home-screen installation.

Direct design consequences:

- Screens are designed for a phone screen first, then widened.
- Quick manual entry (UC-02, target < 15 s) is the primary mobile journey; file import is treated as a mostly desktop use.
- A service worker provides a **read-only cache** (see ADR-0008).
- Push notifications go through the Web Push API (see `04-modules.md § K`).

## Consequences

**Benefits**

- One code base, one deployment, no store review cycle.
- No frozen client version at the user's end: a bug fix is immediate, which avoids the whole backward-compatibility problem of mobile clients.
- Near-zero marginal cost compared to web alone.

**Accepted costs and limits**

- **No store presence.** Acquisition goes through the web. If store distribution becomes a concern, this has to be reconsidered.
- **Limited push on iOS.** Web Push support on iOS is more constrained than on Android: it requires the user to have installed the PWA on their home screen, and capabilities remain below native APNs. The exact state of support must be verified when implementing the corresponding lot, and no critical feature should depend on it.
- **No access to native APIs** (system biometrics, widgets, advanced native sharing). The application lock will rely on a PIN rather than system biometrics on some devices.
- **Perception.** A PWA is still seen as "less of a real app" by some users.

**What this does not forbid**

A move to React Native remains open. To keep it cheap, the following rule applies from now on: **all reusable business logic lives in `packages/contracts` or in `domain/` folders, never in React components.** If a native application is decided later, only the presentation layer needs rewriting.

## Re-examination — triggered

The signals anticipated here (store presence, reliable iOS push, dominant mobile usage) were joined by a fourth, unanticipated and decisive: **the need for offline writes**. The primary mobile journey (UC-02, quick entry) is a write, and [ADR-0008](0008-cache-lecture-seule.md) disables it without a network. See [ADR-0010](0010-offline-first-mobile.md).
