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

## Done in PR #11

- Hardened list item payload validation.
- Hardened wishlist payload validation and cover URL handling.
- Hardened recommendation feedback validation and DB error handling.
- Hardened recommendation mood DB error handling.
- Hardened search tracking DB error handling.
- Hardened Xbox import input validation and cover URL handling.
- Hardened report target validation.
- Reviewed avatar and post image uploads; no extra patch needed.
- Reviewed `recommendations/route` cautiously through connector-limited context; no direct broad edit applied.
- Reviewed recommendation fetchers where safe; no broad algorithm edit applied.

## Known follow-ups

1. `src/app/api/recommendations/route.ts`
   - Large/truncated through connector views.
   - Potential targeted follow-up: ensure `bypass_cooldown=1` is service-call only.
   - Do this locally/Codex with full file context, not via truncated connector patch.

2. `src/lib/reco/fetchers-igdb.ts`
   - IGDB token fetch should get an explicit timeout.
   - File is long and contains multiple fetcher sections; patch locally/Codex with full context.

3. `src/app/api/recommendations/similar/route.ts`
   - Still large/recommendation-critical.
   - Do not rewrite blindly through connector-truncated file views.
   - Best next step: local/Codex pass for rate limits, input caps, timeout checks, and helper extraction.

## Current status

- PR #11 is draft and mergeable.
- Latest CI is green before this tracker-only update.
- Keep remaining changes small or stop and review/merge.
