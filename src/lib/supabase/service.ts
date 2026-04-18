// src/lib/supabase/service.ts
// Client Supabase con SERVICE_ROLE key — bypassa la RLS.
// ⚠️ Usare SOLO in route server-side (API routes, server actions).
// NON esporre mai questo client al browser.
//
// Fix #6 Repair Bible: ogni utilizzo loggato con `reason` per audit.
// Service role solo per: cron, admin, scrittura su tabelle che richiedono
// superamento RLS legittimo (es. leaderboard, steam_import_log).

import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * Crea un client Supabase con service_role key.
 * @param reason Descrizione dell'uso — es. "steam-import:bypass-RLS-for-system-write"
 */
export function createServiceClient(reason?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      '[Supabase Service] Variabili mancanti: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non configurate su Vercel'
    )
  }

  // Audit log: traccia ogni uso del service client
  if (reason) {
    logger.info('service_client_used', { reason, ts: Date.now() })
  } else if (process.env.NODE_ENV === 'production') {
    logger.warn('service_client_used', { reason: 'NO_REASON_PROVIDED', ts: Date.now() })
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}