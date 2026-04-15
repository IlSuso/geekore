// src/lib/supabase/service.ts
// Client Supabase con SERVICE_ROLE key — bypassa la RLS.
// ⚠️ Usare SOLO in route server-side (API routes, server actions).
// NON esporre mai questo client al browser.

import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      '[Supabase Service] Variabili mancanti: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non configurate su Vercel'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}