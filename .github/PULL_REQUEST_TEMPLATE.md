## Summary

<!-- What changes, why. Link the roadmap lot / issue if relevant. -->

## Type of change

- [ ] Feature
- [ ] Fix
- [ ] Refactor
- [ ] Docs
- [ ] Chore / CI

## Checklist

- [ ] Base branch is `develop` (not `main`)
- [ ] `npm run lint && npm run typecheck && npm run test` pass
- [ ] Unit tests added for new business rules
- [ ] Integration test + multi-user isolation test added for each new/changed endpoint
- [ ] Prisma migration is versioned and reversible (if schema changed)
- [ ] `docs/03` / `docs/05` updated (if model or API changed)
- [ ] `fr` and `en` i18n keys both updated (if user-facing strings changed)
- [ ] No amount stored/logged as `float`/`Number`; no token in `localStorage`; no amount/label in logs or push payloads

## Test plan

<!-- Steps to verify manually. -->

## Screenshots

<!-- If UI changed. -->
