# Final roadmap closeout

Final closeout from current `main` after the SQL/RLS/RPC/cron/service-role and recommendation hardening work.

## Base

Started from `main` at commit `8c02335295d69f769559a1c93a987f4edc2b9702`.

## Completed work

### Database / Supabase hardening

- Audited RLS-enabled tables with zero policies.
- Reviewed storage policies.
- Reviewed SECURITY DEFINER functions and grants.
- Tightened function search paths where applicable.
- Removed broad default public privileges where possible from the SQL editor context.
- Reviewed cron/service-role related access patterns.

### Recommendation hardening

- Reduced and modularized large recommendation route files.
- Hardened `/api/recommendations` service-call handling.
- Restricted cooldown bypass to internal/service calls only.
- Validated recommendation media type selection against allowed media types.
- Capped and deduplicated `/api/recommendations/similar` query inputs.
- Added timeout coverage to IGDB/TMDb/AniList paths checked in the refactored helpers.
- Added timeout to `src/lib/reco/fetchers-igdb.ts` token fetch on `main`.
- Moved background recommendation work to Next `after()` where appropriate.
- Added caps around social-favorite recommendation query fanout.

### Large-file cleanup

- Reduced `src/app/home/page.tsx` by extracting feed UI/data/helpers.
- Reduced `src/app/api/recommendations/route.ts` by extracting route helpers.
- Reduced `src/app/api/recommendations/similar/route.ts` by extracting similar recommendation helpers.

### Runtime/build fixes

- Fixed duplicate `style` JSX issue in `not-found.tsx`.
- Fixed duplicate React keys in `DNAWidget`.
- Confirmed local production build passed after the large-file refactor.
- Confirmed PR CI passed on hardening passes before merge.

## Final status

The originally planned audit/hardening/refactor roadmap is considered complete for this cycle.

Future work should be treated as a new roadmap, not continuation of the previous pass.

## Suggested future roadmap

- Add automated tests for recommendation edge cases.
- Add integration checks for cron/service-role flows.
- Add observability dashboards for recommendation regeneration failures/timeouts.
- Continue shrinking any remaining files only when a concrete bug or maintenance problem appears.
