# Hardening pass 6

Draft tracker for the next isolated hardening pass from the latest `main`.

## Base

Started from `main` at commit `58eb04f699d71ea83019cc12b6b24094c350d1c6` after the latest UI color updates.

## Focus

- Keep this PR separate from PR #11.
- Continue with delicate recommendation-adjacent follow-ups.
- Avoid broad rewrites of large/truncated files.
- Prefer tiny, reviewable patches with CI after each meaningful change.

## Planned priorities

1. `src/app/api/recommendations/route.ts`
   - Targeted review only.
   - Candidate fix: ensure cooldown bypass is internal/service-only.

2. `src/lib/reco/fetchers-igdb.ts`
   - Candidate fix: add timeout to IGDB token fetch.
   - Avoid editing unrelated BGG/game logic.

3. `src/app/api/recommendations/similar/route.ts`
   - Inspect only if file context is sufficient.
   - Do not rewrite blindly.

4. Final CI/build-risk review.
