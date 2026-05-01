# Hardening pass 4

Draft tracker for the next isolated hardening pass.

## Focus

- Dedicated review of `recommendations/similar`.
- Review of the main recommendations route only with high caution.
- Remaining cleanup of legacy local rate limiter usage where safe.
- Build-risk review before merge.

## Rules

- Keep changes isolated from `main` until reviewed.
- Prefer small, reviewable commits.
- Avoid broad rewrites of recommendation-critical routes unless the change is mechanical and low-risk.
