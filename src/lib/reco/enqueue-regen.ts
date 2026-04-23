// src/lib/reco/enqueue-regen.ts
// Utility per inserire un job di rigenerazione del master pool.
// Chiamala da qualsiasi punto dell'app — è fire-and-forget lato client.
// Il job viene processato dalla Edge Function Supabase in background,
// indipendentemente da cosa fa il client dopo.

import { createClient } from '@/lib/supabase/client'

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

interface EnqueueOptions {
  mediaTypes?: MediaType[]   // se omesso → tutti i tipi
  forceRefresh?: boolean     // default true
}

/**
 * Inserisce un job di regen nel master pool.
 * Il pg_cron lo processerà entro 60 secondi via Edge Function.
 * Anche se l'utente chiude l'app, il job viene completato sui server Supabase.
 */
export async function enqueueRegenJob(options: EnqueueOptions = {}): Promise<void> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Evita job duplicati: se c'è già un job pending/running per questo utente, non aggiungere
    const { data: existing } = await supabase
      .from('regen_jobs')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['pending', 'running'])
      .limit(1)

    if (existing && existing.length > 0) {
      // Job già in coda — non serve aggiungerne un altro
      return
    }

    await supabase.from('regen_jobs').insert({
      user_id: user.id,
      media_types: options.mediaTypes || null,  // null = tutti i tipi
      force_refresh: options.forceRefresh ?? true,
      status: 'pending',
    })
  } catch {
    // Fire-and-forget: ignora errori silenziosamente
  }
}