# ADR-0015 — The marketing site is separated from the application

## Status
Accepted — 2026-09-19
Complements [ADR-0007](0007-strategie-mobile-pwa.md) (PWA strategy) and follows the same reasoning as [ADR-0012](0012-mobile-in-the-existing-monorepo.md), applied in the opposite direction: here the coupling is organizational, not semantic, so the conclusion is a separate repository rather than a shared one.

## Context

`apps/web` currently serves both the public marketing site and the authenticated application on the same domain, `mister-wallet.com`. This creates three problems:

1. **Shared blast radius.** Every deployment of the app redeploys the landing page, and every deployment of the landing page redeploys the app. A regression in either one can take down the other.
2. **The landing page pays the app's runtime cost.** The entire public page is one client component (`HomeView.tsx`, ~500 lines, Framer Motion, TanStack Query, `useAuthSession`), so a visitor who has never logged in downloads and hydrates the same React runtime as an authenticated user managing their budget. This caps achievable LCP/INP, and therefore SEO.
3. **No room for editorial content.** A blog or FAQ meant to be indexed and cited by generative search does not belong in an authenticated app's bundle, and adding one to `apps/web` would only make problem 2 worse.

The boundary between public and private content already exists at the HTTP level — `apps/web/src/proxy.ts` applies `X-Robots-Tag: noindex, nofollow` to everything except four paths — but nothing separates them operationally.

## Decision

The public site and the application become two independent deployments on two subdomains:

- **`mister-wallet.com`** (apex, `www` redirects to it) — marketing: landing, pricing, about, blog, FAQ, legal pages, `account-deletion`. Built with **Astro 5**, statically rendered, in a **new repository** (`mister-wallet-site`).
- **`app.mister-wallet.com`** — the application and every authentication route (login, register, password reset, email verification). Stays **Next.js**, in this repository (`apps/web`, unchanged in framework).

Editorial content (blog, FAQ) is authored as **versioned MDX files** in the marketing repository. No new backend service is introduced for it.

### Options considered and rejected

- **A third workspace in this monorepo.** ADR-0012 set a precedent for keeping a new client alongside `apps/api` and `apps/web`, but that precedent applies to *semantic* coupling — shared correctness-critical code (the money kernel, `packages/contracts`, the sync protocol). The marketing site shares none of that. Keeping it in the monorepo would still couple its CI, its dependency versions, and its `npm install` health to the app's, which is exactly the blast radius this decision removes.
- **A duplicate Next.js app.** Would reuse `next-intl` and the existing shadcn components as-is, but keeps the React hydration cost that this separation exists to eliminate.
- **A headless CMS.** Adds a database and a service to host and secure, for a volume of editorial content that does not justify the operational cost. MDX in Git is reversible into a CMS later without changing any URL.
- **A blog module inside `apps/api`.** Directly contradicts the goal: publishing an article would redeploy the financial API.

## Consequences

**Benefits**
- Independent deploy pipelines; a marketing content change cannot break the app, and vice versa.
- The marketing site ships zero JavaScript by default, which a monolithic React app cannot.
- Blog and FAQ content ships without any new infrastructure.
- The public domain's attack surface is reduced to static assets.

**Costs**
- **Design tokens are duplicated.** There is no shared `packages/ui` between two repositories; `apps/web/src/styles/globals.css` is copied once into the marketing repo and must be kept in step by hand. See `docs/16-marketing-site-split.md` for the reduction plan.
- **Two CI pipelines** to maintain instead of one.
- **The Android TWA must be migrated.** `apps/web/twa-manifest.json` is bound to `host: mister-wallet.com`; moving the app to `app.mister-wallet.com` requires publishing a new version signed with the existing keystore, before the DNS cutover.
- **Two CORS origins** (`CORS_ORIGIN`, `WEB_APP_URL`) to maintain on the API instead of one.

## Re-examination

If the duplicated design tokens visibly drift out of sync, or if a third front end appears that would also need them, extract a published `packages/ui` (or an npm-published component package) shared across repositories at that point — not before, since a shared package is itself a coordination cost that only pays for itself once there are at least two independent consumers with a real drift problem.
