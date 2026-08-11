# Security Policy

Budget Manager handles personal financial data. Security issues get priority handling.

## Supported versions

Pre-1.0, actively developed on `develop`/`main`. Only the latest commit on `main` is supported — no back-porting of fixes to older tags.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately to: **contact@mister-wallet.com**

Include:
- Affected component/endpoint and, if known, file/line.
- Steps to reproduce (minimal repro preferred).
- Impact assessment (data exposure, privilege escalation, etc.).

## Response targets

- Acknowledgment: within 3 business days.
- Initial triage (confirmed / not applicable / needs more info): within 7 business days.
- Fix or mitigation timeline communicated once triaged.

## Scope

In scope:
- `apps/api` (NestJS backend), `apps/web` (Next.js frontend), `packages/contracts`.
- Auth flow (JWT, refresh token cookie, Argon2id hashing).
- Cross-user data isolation (`userId` scoping on all business queries).
- Audit log integrity (append-only guarantee).

Out of scope:
- Third-party dependencies (report upstream; open a GitHub issue here only if it requires an app-side workaround).
- Denial-of-service via brute-force volume against a local dev instance.

## Disclosure

Coordinated disclosure preferred. Please allow a fix to ship before public disclosure. Credit given in the fix commit/release notes unless you prefer to stay anonymous.
