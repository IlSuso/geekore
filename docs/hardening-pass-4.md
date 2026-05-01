# Hardening pass 4

Draft tracker for the next isolated hardening pass.

## Focus

- Dedicated review of `recommendations/similar`.
- Review of the main recommendations route only with high caution.
- Remaining cleanup of legacy local rate limiter usage where safe.
- Cron review.
- Supabase SQL/RLS/RPC audit.
- Build-risk review before merge.

## Rules

- Keep changes isolated from `main` until reviewed.
- Prefer small, reviewable commits.
- Avoid broad rewrites of recommendation-critical routes unless the change is mechanical and low-risk.

## Current PR #10 changes

- Hardened `src/app/api/cron/taste-maintenance/route.ts` authorization/runtime behavior.
- Hardened `src/app/api/cron/email-digest/route.ts` authorization/runtime behavior, service client use, HTML escaping, and batch cap.
- Added timeout guards to internal recommendation regeneration fetches:
  - `src/app/api/cron/process-regen-jobs/route.ts`
  - `src/app/api/recommendations/background-regen/route.ts`
- Added read-only Supabase audit script:
  - `supabase/audit-checks-2026-05-02.sql`

## Codex-analysis based priorities

### Done in previous passes

- Removed fake activity route.
- Hardened Steam OpenID flow in earlier work.
- Hardened post/avatar upload paths.
- Hardened CSRF token generation.
- Added security headers/log cleanup in earlier work.
- Moved many mutating and external API routes to distributed rate limiting.
- Added/strengthened CI build workflow.

### Done in this pass

- `taste-maintenance` and `email-digest` now fail closed when `CRON_SECRET` is missing.
- Cron routes accept explicit shared-secret auth via `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret`.
- `email-digest` uses the service client intentionally and limits processed users per run.
- `process-regen-jobs` already claims jobs with `status = pending`; now its internal fetch also has an explicit timeout.
- `background-regen` validates secret/body/user id/profile existence; now its internal fetch also has an explicit timeout.
- Supabase audit SQL exists for manual export of RLS, policies, grants, SECURITY DEFINER functions, storage policies, triggers, and HTTP/cron/vault extensions.

### Still open

1. `recommendations/similar`
   - Large and recommendation-critical.
   - Do not rewrite blindly through connector-truncated file views.
   - Safer tasks: targeted local/Codex pass, split helpers, migrate local rate limiter, reduce noisy logs, add request caps.

2. `recommendations/route`
   - Main recommendation engine.
   - Only touch with dedicated review and tests.
   - Main goals: document master/serving/cache roles, reduce noisy logs, isolate helpers.

3. Supabase audit follow-up
   - Run `supabase/audit-checks-2026-05-02.sql` manually in Supabase SQL Editor.
   - Paste/export the result sets back into review.
   - Prioritize findings where `SECURITY DEFINER` functions are executable by `anon`, `authenticated`, or `public`.
   - Prioritize storage policies where write/delete is allowed to broad roles.
   - Prioritize tables with RLS disabled or grants that expose direct table access beyond intended RLS.

4. Remaining service-role review
   - Continue checking service-role route-by-route.
   - Highest-risk acceptable uses should have all three: authenticated/current-user guard, narrow target scope, and explicit reason in `createServiceClient(reason)`.
   - Watch for service-role writes driven by user-supplied ids.

5. Tests
   - Add focused API/security smoke tests later.

6. Frontend refactor
   - `home/page.tsx` remains technical debt but not immediate security priority.
