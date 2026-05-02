# Hardening pass 7

Draft tracker for the next clean pass from the current `main`.

## Base

Started from `main` at commit `ab21cf949dc97653a8dd5971b56897c5e75834c9`.

## Context

The large-file refactor work was applied and tested outside the old connector PR flow. PR #13 was closed because it only contained an outdated partial commit and no longer represented the real current state.

## Focus

- Continue from current `main` only.
- Keep changes small and reviewable.
- Prefer endpoint/security/build-risk fixes over broad rewrites.
- Do not use `tsconfig` exclusions as build workarounds.
- For large files, request the full file and produce local ZIP patches rather than connector-replacing huge files.

## Planned priorities

1. Re-check current build/CI status from fresh PR.
2. Continue remaining API hardening from the previous roadmap:
   - recommendation-adjacent edge cases;
   - external fetch timeouts;
   - input caps and duplicate key warnings;
   - service/internal-only bypasses.
3. Keep PR small enough to merge safely.
