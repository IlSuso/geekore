// Edge Function deprecata — il background regen è ora gestito dal trigger
// Postgres + pg_net che chiama direttamente /api/recommendations/background-regen.
// Questa funzione non viene più invocata in produzione.

Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({ ok: true, note: 'deprecated — regen handled by pg_net trigger' }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
