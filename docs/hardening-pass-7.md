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

## Done in PR #14

- Rechecked current build state from a fresh PR.
- Restricted recommendation `bypass_cooldown=1` to internal/service calls only.
- Validated recommendation media type selection against the allowed media-type whitelist.
- Capped and deduplicated `/api/recommendations/similar` query inputs:
  - `title`
  - `genres`
  - `keywords`
  - `tags`
  - `excludeId`
  - `type`
- Reviewed refactored similar helpers:
  - `src/lib/reco/similar/igdb.ts`
  - `src/lib/reco/similar/tmdb.ts`
  - `src/lib/reco/similar/anilist.ts`
  - `src/lib/reco/similar/scoring.ts`
- Confirmed timeout coverage in the refactored similar helpers.
- Confirmed duplicate-key DNA widget fix is already present on current `main`.

## Current status

- PR #14 is draft and mergeable.
- Latest CI is green before this tracker-only update.
- Keep any remaining changes small or stop and review/merge.

## Remaining follow-up

- `src/lib/reco/fetchers-igdb.ts` still contains a token fetch without explicit timeout, but the file remains too large for a safe connector replacement. Patch locally/Codex or provide the full file for a ZIP-style patch if needed.
