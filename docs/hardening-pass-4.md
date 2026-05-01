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

## Codex-analysis based priorities

### Done in previous passes

- Removed fake activity route.
- Hardened Steam OpenID flow in earlier work.
- Hardened post/avatar upload paths.
- Hardened CSRF token generation.
- Added security headers/log cleanup in earlier work.
- Moved many mutating and external API routes to distributed rate limiting.
- Added/strengthened CI build workflow.

### Still open

1. `recommendations/similar`
   - Large and recommendation-critical.
   - Do not rewrite blindly through connector-truncated file views.
   - Safer tasks: targeted local/Codex pass, split helpers, migrate local rate limiter, reduce noisy logs, add request caps.

2. `recommendations/route`
   - Main recommendation engine.
   - Only touch with dedicated review and tests.
   - Main goals: document master/serving/cache roles, reduce noisy logs, isolate helpers.

3. Cron review
   - Check cron auth, schedule, idempotency, service-role use, external API timeouts.

4. Supabase audit
   - RLS enabled tables.
   - SECURITY DEFINER RPC grants/search_path.
   - Storage bucket policies.
   - Public/service-role leakage checks.

5. Tests
   - Add focused API/security smoke tests later.

6. Frontend refactor
   - `home/page.tsx` remains technical debt but not immediate security priority.
