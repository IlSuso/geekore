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

## Planned priorities

1. Check remaining recommendation-adjacent helper files that are now smaller/segmented.
2. Review external fetch/token timeout follow-ups where files are safe to patch.
3. Review service/internal-only access paths and cache invalidation paths.
4. Final CI/build-risk pass.
