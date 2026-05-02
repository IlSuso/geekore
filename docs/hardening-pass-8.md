# Hardening pass 8

Draft tracker for the next clean pass from current `main` after PR #14 merge.

## Base

Started from `main` at commit `699522ad6f72d71add2b32da90879244709ab68f`.

## Context

PR #14 was merged and covered:

- `bypass_cooldown=1` restricted to internal/service calls only.
- Recommendation media type selection validated against whitelist.
- `/api/recommendations/similar` query input caps and source-type whitelist.
- Review of refactored `similar/*` helpers and timeout coverage.

## Focus

- Continue small hardening from current `main`.
- Keep PR small and mergeable.
- Avoid broad algorithm rewrites.
- For still-large files, request full file and use ZIP patch flow.

## Done in PR #15

- Created fresh PR from current `main` after PR #14 merge.
- Validated recommendation service-call `X-Service-User-Id` as UUID before using service-role client.
- Added timeout to internal refresh-pool background regeneration fetch.
- Moved background master regeneration onto Next `after()` instead of fire-and-forget IIFE.
- Moved recommendation creator profile and pool profile persistence onto Next `after()` with best-effort error handling.
- Added safety cap and friend-id filtering to social favorite recommendation query.
- Reviewed these smaller recommendation route helpers:
  - `src/lib/reco/route/context.ts`
  - `src/lib/reco/route/fastPaths.ts`
  - `src/lib/reco/route/masterRegen.ts`
  - `src/lib/reco/route/response.ts`
  - `src/lib/reco/route/inputs.ts`
  - `src/lib/reco/route/exposure.ts`
  - `src/lib/reco/route/social.ts`

## Current status

- PR #15 is draft and mergeable.
- Latest CI for the last code commit was not visible yet when this tracker was updated.
- Keep remaining changes small or stop after CI is green.

## Remaining follow-up

- `src/lib/reco/fetchers-igdb.ts` still has a token fetch without explicit timeout, but remains too large for safe connector replacement. Patch via local/Codex or ZIP flow if needed.
