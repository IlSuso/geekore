# Final hardening pass

Final clean pass from current `main` after PR #15 merge.

## Base

Started from `main` at commit `0af3b35a1e57bf9b8c9caf8cadf18dcb8a31dabb`.

## Goal

Close the remaining technical follow-ups from the SQL/RLS/RPC/cron/service-role and recommendation hardening roadmap.

## Checks completed in PR #16

- Rechecked `main` after PR #15 merge.
- Created final PR from current `main`.
- Confirmed CI is green on the initial final-pass commit.
- Rechecked IGDB/token timeout coverage in readable paths:
  - `src/app/api/igdb/route.ts`: token fetch already has `AbortSignal.timeout(8000)`.
  - `src/lib/reco/similar/igdb.ts`: token fetch already has `AbortSignal.timeout(6000)`.
  - `src/app/api/recommendations/onboarding/route.ts`: token fetch already has timeout.
- Confirmed the only remaining known timeout follow-up is inside `src/lib/reco/fetchers-igdb.ts`.

## Remaining blocker

`src/lib/reco/fetchers-igdb.ts` still has an IGDB token fetch without explicit timeout, but the GitHub connector returns only a truncated version of the file. Do not replace this file through the connector without full file context.

Safe fix needed inside `getIgdbToken`:

```ts
const res = await fetch('https://id.twitch.tv/oauth2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
  signal: AbortSignal.timeout(6000),
})
```

Recommended application path:

- patch locally/Codex, or
- provide the full `src/lib/reco/fetchers-igdb.ts` file and apply via ZIP-style patch.

## Out of scope

- Broad recommendation algorithm rewrites.
- Large file replacement through connector if full file context is unavailable.
- UI redesign.
