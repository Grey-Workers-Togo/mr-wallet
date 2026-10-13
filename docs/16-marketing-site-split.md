# 16 — Marketing site split

Implementation plan for [ADR-0015](adr/0015-marketing-site-separation.md). Tracked as **Lot 17** in `ROADMAP_TASKS.md`.

Target topology:

| Domain | Content | Stack | Repository |
|---|---|---|---|
| `mister-wallet.com` (+ `www` → apex) | Marketing: landing, pricing, about, blog, FAQ, legal, `account-deletion` | Astro 5, static | new repo, `mister-wallet-site` |
| `app.mister-wallet.com` | Application + every auth route | Next.js 16 (`apps/web`, unchanged) | this repo |

---

## Phase 0 — DNS, repo, docs

- DNS record for `app.mister-wallet.com`.
- New hosting project for the app on `app.mister-wallet.com`; the current `apps/web` project is repointed or replaced.
- New GitHub repository `Grey-Workers-Togo/mister-wallet-site`.
- This document, ADR-0015, and the Lot 17 entry in `ROADMAP_TASKS.md` committed and cross-linked from `docs/02-architecture.md`, `docs/11-deploiement.md`, `docs/HOMEPAGE_SPEC.md`.

---

## Phase 1 — Astro skeleton (new repo)

```
src/
  content.config.ts          # blog + faq + legal collections (glob loader + zod)
  content/
    blog/{fr,en}/*.mdx
    faq/{fr,en}/*.mdx
    legal/{fr,en}/*.mdx      # privacy, terms, account-deletion
  i18n/
    ui.ts                    # fr/en dictionaries, seeded from messages/*.json's `home` namespace
    utils.ts                 # useTranslations(locale), getLocalizedPath
  layouts/BaseLayout.astro   # <head>, hreflang, JSON-LD, theme
  components/                # .astro ports of the landing components
  pages/
    [locale]/index.astro
    [locale]/pricing.astro
    [locale]/about.astro
    [locale]/blog/index.astro
    [locale]/blog/[...slug].astro
    [locale]/faq.astro
    [locale]/legal/[...slug].astro
    [locale]/account-deletion.astro
  styles/global.css
astro.config.mjs
public/                      # icons, screenshots, OG images
```

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://mister-wallet.com',
  output: 'static',
  i18n: {
    locales: ['fr', 'en'],
    defaultLocale: 'fr',
    routing: { prefixDefaultLocale: true }, // keeps /fr/... and /en/... — no indexed URL changes
  },
  integrations: [mdx(), react(), sitemap({ i18n: { defaultLocale: 'fr', locales: { fr: 'fr-FR', en: 'en-US' } } })],
  vite: { plugins: [tailwindcss()] },
});
```

`prefixDefaultLocale: true` is mandatory: the currently indexed URLs are `/fr` and `/en`. The landing page's URL structure does not change.

Content collections (`src/content.config.ts`) use the Astro 5 glob loader + zod, minimal schema `{ title, description, pubDate, updatedDate?, tags[], draft, ogImage? }`.

**i18n policy**: the CLAUDE.md rule "no human-readable text in the database or API" does not apply here — this is versioned editorial content, not application data. fr/en parity is still mandatory: port `apps/web/scripts/check-i18n-parity.ts` into the marketing repo and extend it to check that every `content/*/fr/x.mdx` has an `content/*/en/x.mdx` twin. The build fails otherwise.

---

## Phase 2 — Landing content migration

Source: `apps/web/src/app/[locale]/HomeView.tsx` + the `home` namespace of `apps/web/messages/{fr,en}.json` (sub-keys `seo, hero, features, principles, security, screenshots, testimonials, pricing, designedFor, howItWorks, faq, ctaFinal, footer`) + `docs/HOMEPAGE_SPEC.md`.

Ported to `.astro` (zero JS): `FeatureCard`, `PricingCard`, `TestimonialCard`, `TimelineStep`, `FAQItem` (native `<details>`), `SiteHeader`, `Logo`.

Kept as React islands (`client:visible` / `client:idle`) only: `ScreenshotsGallery`, `ThemeToggle`, `LanguageSwitcher`, the mobile menu. Framer Motion is **not** ported — replaced with CSS animations (`@starting-style`, `animation-timeline: view()`); reimporting ~40 kB of JS for decoration would defeat the purpose of the split.

Design tokens: `apps/web/src/styles/globals.css` (Tailwind v4 `@theme` blocks, color variables, `--font-jakarta`) is copied into the marketing repo as-is. This duplication is accepted as the cost of a separate repository (ADR-0015); `globals.css` in `apps/web` stays the source of truth and changes must be ported by hand.

`HomeView.tsx` currently calls `useAuthSession()` to swap the CTA to "Access my space" when a refresh cookie exists. A static site cannot know this at build time. Two options:

- **Dynamic CTA**: a small client script calls `POST {API_URL}/auth/refresh` with `credentials: 'include'` and rewrites the CTA label. Requires adding `https://mister-wallet.com` to the API's `CORS_ORIGIN`.
- **Static CTA** (default, conservative): a single "Log in" CTA linking to `app.mister-wallet.com/fr/login`, no CORS change.

Default to the static CTA; the dynamic option is logged as an open question in `docs/QUESTIONS.md` and revisited only if conversion data justifies the added CORS surface.

Assets to move: `apps/web/public/screenshots/*`, OG images, logos.

---

## Phase 3 — SEO / AEO / GEO

**Technical SEO**
- `@astrojs/sitemap` generates `sitemap-index.xml` with automatic hreflang `xhtml:link` alternates.
- `src/pages/robots.txt.ts`: `Allow: /`, `Sitemap: https://mister-wallet.com/sitemap-index.xml`. No rule references `app.` (which keeps its own `noindex` `robots.ts`).
- Absolute `<link rel="canonical">` + `hreflang` fr/en/x-default in `BaseLayout.astro`.
- Performance budget: zero JS on the landing page outside islands, LCP < 1.5 s, CLS < 0.05, checked with Lighthouse CI.

**Structured data** (`BaseLayout.astro`, adapted from `apps/web/src/app/[locale]/layout.tsx:69-101`)
- `Organization` + `WebSite`, same `@id` scheme (`https://mister-wallet.com/#organization`).
- `SoftwareApplication` (replaces `WebApplication`) on the home and pricing pages, with real `offers`.
- `FAQPage` on `/faq` **and** on the home page's FAQ section — this is what feeds generative search answers.
- `BlogPosting` + `BreadcrumbList` on every article.

**AEO / GEO** (visibility in AI-generated answers)
- Every article and product page opens with a self-contained 40–60 word answer paragraph, under a question-phrased H1 where relevant — this is the block generative engines quote.
- Content fully readable without JS, which Astro provides by construction.
- `public/llms.txt`, adapted from the `llms.txt` already at the root of this repository, served from the marketing domain (index of key pages + product summary).
- Consistent entity naming: canonical name "Mr Wallet", `alternateName: ['Mister Wallet']` (already in place), `sameAs` pointing to GitHub and social profiles.
- A distinct, hand-written `<meta name="description">` per page — no templated description.

---

## Phase 4 — `apps/web` cleanup

1. **Remove** `src/app/[locale]/page.tsx`, `HomeView.tsx`, `src/components/landing/*`, `public/screenshots/*`, `src/app/[locale]/account-deletion/page.tsx`, and the `home` namespace from `messages/{fr,en}.json` — **except** the keys still used elsewhere (`home.hero.title` backs `applicationName`/`appName` in `layout.tsx:30,68`: move those values into an `app` namespace or a constant).
2. `src/app/[locale]/page.tsx` becomes a **redirect**: valid session → `/[locale]/accounts`, otherwise → `/[locale]/login`.
3. `src/app/robots.ts`: global `disallow: '/'`, sitemap reference removed.
4. **Remove** `src/app/sitemap.ts`.
5. `src/proxy.ts`: apply `X-Robots-Tag: noindex, nofollow` to every route, drop `PUBLIC_PATHS`.
6. `src/components/layouts/ConditionalShell.tsx`: remove `'/'` from `PUBLIC_PATHS`.
7. `src/app/[locale]/layout.tsx`: remove both JSON-LD blocks (they belong to the marketing domain); keep `manifest`, icons, viewport, theme.
8. Add outbound links to `https://mister-wallet.com` from `AuthLayout.tsx` (clickable logo) and the app footer.
9. `next.config.ts`: permanent redirects `/{locale}` → `https://mister-wallet.com/{locale}` and `/{locale}/account-deletion` → `https://mister-wallet.com/{locale}/account-deletion`, for visitors still landing on the old domain through the app.

Verify no dead imports remain: `rg "landing/|HomeView|namespace=.home." apps/web/src`.

---

## Phase 5 — Redirects and domain cutover

On `mister-wallet.com` (now served by the Astro site), **permanent 301s** to `app.mister-wallet.com` for:

```
/{locale}/login            /{locale}/register         /{locale}/login/oauth
/{locale}/register/oauth   /{locale}/forgot-password  /{locale}/reset-password
/{locale}/verify-email     /{locale}/accounts         /{locale}/transactions
/{locale}/categories       /{locale}/tags             /{locale}/budgets
/{locale}/debts            /{locale}/goals            /{locale}/recurrences
/{locale}/reports          /{locale}/forecast         /{locale}/import
/{locale}/export           /{locale}/notifications    /{locale}/preferences
/manifest.json  /sw.js  /.well-known/assetlinks.json
```

Configured in the hosting platform's redirect rules (or `redirects` in `astro.config.mjs` for the fixed routes). Path and query string are preserved.

`/{locale}` and `/{locale}/account-deletion` do **not** redirect: they are served by the marketing site, at the same URLs as before. No ranking loss on the indexed home page.

On the API (`apps/api`):
- `CORS_ORIGIN` → `https://app.mister-wallet.com` (plus `https://mister-wallet.com` only if the dynamic CTA from Phase 2 is adopted).
- `WEB_APP_URL` → `https://app.mister-wallet.com` (used in verification and password-reset email links — check per endpoint).
- OAuth provider redirect URIs updated.
- `Caddyfile` unchanged; it only proxies `{$API_DOMAIN}`.

---

## Phase 6 — PWA and Android TWA

The TWA manifest is bound to `host: mister-wallet.com` / `fullScopeUrl: https://mister-wallet.com/` (`apps/web/twa-manifest.json`), package `com.grey.gwallet.gestion_portefeuilles`, `appVersionCode: 21`.

1. `apps/web/public/manifest.json`: `start_url` → `/fr/accounts`, `scope` → `/`, shortcuts unchanged (served from `app.`).
2. `apps/web/twa-manifest.json`: `host` → `app.mister-wallet.com`, `webManifestUrl`/`fullScopeUrl`/`iconUrl` → `https://app.mister-wallet.com/...`, `appVersionCode: 22`.
3. Serve `/.well-known/assetlinks.json` from `app.mister-wallet.com` with the **same SHA-256 fingerprint** as today. **Do not regenerate the signing key**: `android.keystore` / alias `mr_wallet` must be reused unchanged, or the Play Store update is rejected.
4. Rebuild and publish v22 (`bubblewrap build`).
5. Keep `/.well-known/assetlinks.json` reachable on the old domain (redirected) during the transition, while the installed base updates.

Until a device updates to v22, it opens the redirected URL in a Custom Tab (visible URL bar) instead of standalone mode — degraded but functional. Publishing v22 **before** the DNS cutover shortens that window.

---

## Phase 7 — CI and documentation

This repo's CI (`.github/workflows/ci.yml`, single job) keeps its structure; remove the removed `home` keys from the i18n parity check.

New marketing repo CI: install → `astro check` → build → fr/en parity (content + UI strings) → Lighthouse CI (perf/SEO budget) → broken-link check.

Docs to update in this repo:
- `docs/02-architecture.md` — add the marketing site as an external component; note it depends on neither the API nor `packages/contracts`.
- `docs/11-deploiement.md` — new two-front topology, domain table, env vars.
- `docs/09-roadmap.md` — reference Lot 17.
- `docs/HOMEPAGE_SPEC.md` — note that the spec is now implemented in the marketing repo; correct the `/dashboard` reference (the real post-login route is `/accounts`).
- `docs/QUESTIONS.md` — log the dynamic-CTA question from Phase 2.

---

## Files

**Removed or changed in this repo**
- `apps/web/src/app/[locale]/page.tsx`, `HomeView.tsx` — removed, replaced by a redirect
- `apps/web/src/components/landing/*` — removed
- `apps/web/src/app/[locale]/account-deletion/page.tsx` — removed (migrated)
- `apps/web/src/app/robots.ts` — `disallow: /`
- `apps/web/src/app/sitemap.ts` — removed
- `apps/web/src/proxy.ts` — global `noindex`
- `apps/web/src/app/[locale]/layout.tsx` — JSON-LD removed, `appName` decoupled from the `home` namespace
- `apps/web/src/components/layouts/ConditionalShell.tsx` — `'/'` removed from `PUBLIC_PATHS`
- `apps/web/messages/{fr,en}.json` — `home` namespace removed
- `apps/web/public/manifest.json`, `apps/web/twa-manifest.json`
- `apps/web/next.config.ts` — outbound redirects
- `.env.prod.example`, `docker-compose.prod.yml` — `CORS_ORIGIN`, `WEB_APP_URL`

**Reused, not rewritten**
- `apps/web/src/styles/globals.css` — design tokens, copied as-is
- `apps/web/messages/{fr,en}.json`'s `home` namespace — source of the marketing copy
- `apps/web/scripts/check-i18n-parity.ts` — parity script to port
- `apps/web/src/app/[locale]/layout.tsx:69-101` — existing JSON-LD to adapt and extend
- `docs/HOMEPAGE_SPEC.md` — landing page spec
- `llms.txt` (repo root) — base for the marketing `llms.txt`

**Untouched**: `apps/api`, `packages/contracts`, `packages/sync-protocol`, `Caddyfile`, all business domain code. No Prisma migration, no data model change.

---

## Verification

**Marketing site (local)**
1. `npm run dev`, then `npm run build && npm run preview`.
2. `/fr` and `/en` render without JS: `curl -s localhost:4321/fr | rg "Mr Wallet"` returns the full content.
3. Content stays readable with JS disabled in the browser.
4. `dist/sitemap-index.xml` lists both locales with hreflang `xhtml:link` alternates.
5. Every page has an absolute canonical, a unique meta description, valid JSON-LD — verified against Google's Rich Results Test.
6. Lighthouse: Performance ≥ 95, SEO = 100, Accessibility ≥ 95 on `/fr` and `/fr/blog/<article>`.
7. i18n parity: removing an `en` key fails the build.

**App**
8. `npm run lint && npm run typecheck && npm run test` at the repo root (per `10-conventions-dev.md`).
9. `curl -I https://app.mister-wallet.com/fr/accounts` → `X-Robots-Tag: noindex, nofollow`.
10. `curl https://app.mister-wallet.com/robots.txt` → `Disallow: /`; `.../sitemap.xml` → 404.
11. Full flow: signup → email verification → login → create an account → create a transaction, including OAuth login.
12. Existing multi-user isolation tests still pass (no API change expected, but they guard against regressions).

**Redirects**
13. For every route in Phase 5: `curl -I https://mister-wallet.com/fr/login` → `301` with the expected `Location`.
14. `curl -I https://mister-wallet.com/fr` → `200`, served by Astro.
15. Query string preserved: `.../fr/verify-email?token=abc` keeps `?token=abc` after the redirect.

**TWA**
16. `curl https://app.mister-wallet.com/.well-known/assetlinks.json` → same `sha256_cert_fingerprints` as v21.
17. Installing the v22 APK opens the app in standalone mode, no URL bar.
18. A device still on v21 still reaches the app through the redirect (degraded Custom Tab mode accepted).

**Post-cutover**
19. Add `app.mister-wallet.com` as a Search Console property, resubmit the marketing sitemap, monitor coverage errors for two weeks.
20. Rankings on `/fr`, `/en`, `/fr/account-deletion` are unchanged — their URLs did not move.
