# Hardening pass 5

Draft tracker for the next isolated hardening pass after PR #10.

## Focus

- Continue security hardening with small, reviewable commits.
- Do not rewrite `recommendations/similar` blindly; treat it as large/recommendation-critical.
- Prefer targeted fixes in routes with clear security or build-risk findings.
- Keep recommendation-engine changes minimal unless inspected locally with full file context.

## Starting point

PR #10 was merged into `main` and covered:

- Supabase SQL/RLS/RPC audit and manual follow-up patches.
- Cron hardening for taste maintenance and email digest.
- Internal regen fetch timeouts.
- Service-role review for social/import paths.
- Push rate-limit context fix.
- Import and mutation safety fixes.

## Planned pass 5 priorities

1. Review remaining non-recommendation API routes for:
   - mutation via GET;
   - missing origin/auth/rate-limit guards;
   - broad service-role writes;
   - unbounded external fetches or request bodies.

2. Review recommendation-adjacent files carefully:
   - `src/app/api/recommendations/route.ts`
   - `src/lib/reco/*`
   - avoid broad algorithm changes.

3. Prepare a local/Codex-friendly note for `recommendations/similar` instead of editing it through truncated connector views.

4. Final CI/build-risk review before merge.
