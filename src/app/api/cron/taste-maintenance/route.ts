// DESTINAZIONE: src/app/api/cron/taste-maintenance/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// V3: Cron job per manutenzione del Taste Engine
//
// Da schedulare ogni 24h (es. via Vercel Cron o GitHub Actions).
// Protetto da CRON_SECRET env var.
//
// Operazioni:
//   1. Cleanup search_history (mantieni max 500 per utente, rimuovi > 60 giorni)
//   2. Invalida recommendations_cache scaduta
//   3. Sincronizza user_creator_profile per utenti attivi
//   4. Pulisce user_taste_profile per utenti inattivi (> 90 giorni)
//
// GET /api/cron/taste-maintenance
//   Header: Authorization: Bearer <CRON_SECRET>
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  // Verifica il secret del cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Usa service role per operazioni admin
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const results: Record<string, any> = {}
  const startTime = Date.now()

  try {
    // ── 1. Cleanup search_history scaduta (> 60 giorni) ─────────────────────
    const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const { count: deletedSearches } = await supabase
      .from('search_history')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff60)

    results.deletedSearchHistory = deletedSearches || 0
    logger.info('cron.taste', `Deleted ${deletedSearches} old search history entries`)

    // ── 2. Invalida recommendations_cache scaduta ────────────────────────────
    const { count: deletedCache } = await supabase
      .from('recommendations_cache')
      .delete({ count: 'exact' })
      .lt('expires_at', new Date().toISOString())

    results.deletedExpiredCache = deletedCache || 0

    // ── 3. Per ogni utente con search_history > 500 righe, tronca ───────────
    // Query diretta SQL più efficiente del loop
    const { error: cleanupErr } = await supabase.rpc('cleanup_search_history_bulk', {
      p_keep: 500
    })
    if (cleanupErr) logger.warn('cron.taste', 'cleanup_search_history_bulk error', cleanupErr)

    // ── 4. Identifica utenti attivi negli ultimi 30 giorni ───────────────────
    const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: activeUsers } = await supabase
      .from('user_media_entries')
      .select('user_id')
      .gte('updated_at', cutoff30)
      .limit(100)

    const activeUserIds = [...new Set((activeUsers || []).map(e => e.user_id))]
    results.activeUsers = activeUserIds.length

    // ── 5. Per gli utenti attivi, aggiorna user_creator_profile se outdated ──
    let updatedCreatorProfiles = 0
    for (const userId of activeUserIds.slice(0, 20)) { // max 20 per cron
      try {
        const { data: entries } = await supabase
          .from('user_media_entries')
          .select('studios, directors, authors, developer, rating, status, updated_at, rewatch_count')
          .eq('user_id', userId)

        if (!entries || entries.length === 0) continue

        const studios: Record<string, number> = {}
        const directors: Record<string, number> = {}
        const authors: Record<string, number> = {}
        const developers: Record<string, number> = {}

        for (const entry of entries) {
          if (entry.status === 'dropped' && (entry.rating || 0) <= 2) continue

          const rating = entry.rating || 0
          const days = (Date.now() - new Date(entry.updated_at || 0).getTime()) / 86400000
          const decay = Math.max(0.2, Math.exp(-0.012 * days) * 3.5)
          const sentiment = rating >= 4.5 ? 2.8 : rating >= 4 ? 2.0 : rating >= 3 ? 1.0 : 0.5
          const rewatch = (entry.rewatch_count || 0) >= 2 ? 5.0 : (entry.rewatch_count || 0) === 1 ? 3.0 : 1.0
          const weight = decay * sentiment * rewatch

          for (const s of (entry.studios || [])) studios[s] = (studios[s] || 0) + weight
          for (const d of (entry.directors || [])) directors[d] = (directors[d] || 0) + weight
          for (const a of (entry.authors || [])) authors[a] = (authors[a] || 0) + weight
          if (entry.developer) developers[entry.developer] = (developers[entry.developer] || 0) + weight
        }

        await supabase.from('user_creator_profile').upsert({
          user_id: userId,
          studios: Object.fromEntries(Object.entries(studios).sort(([,a],[,b]) => b - a).slice(0, 30)),
          directors: Object.fromEntries(Object.entries(directors).sort(([,a],[,b]) => b - a).slice(0, 20)),
          authors: Object.fromEntries(Object.entries(authors).sort(([,a],[,b]) => b - a).slice(0, 20)),
          developers: Object.fromEntries(Object.entries(developers).sort(([,a],[,b]) => b - a).slice(0, 20)),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        updatedCreatorProfiles++
      } catch (err) {
        logger.warn('cron.taste', `Failed to update creator profile for ${userId}`, err)
      }
    }
    results.updatedCreatorProfiles = updatedCreatorProfiles

    // ── 6. Rimuovi user_taste_profile per utenti inattivi (> 90 giorni) ──────
    const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { count: deletedTasteProfiles } = await supabase
      .from('user_taste_profile')
      .delete({ count: 'exact' })
      .lt('computed_at', cutoff90)

    results.deletedStaleTasteProfiles = deletedTasteProfiles || 0

    const elapsed = Date.now() - startTime
    logger.info('cron.taste', `Maintenance completed in ${elapsed}ms`, results)

    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}ms`,
      ...results,
    })

  } catch (error) {
    logger.error('cron.taste', 'Maintenance failed', error)
    return NextResponse.json({ error: 'Maintenance failed', elapsed: `${Date.now() - startTime}ms` }, { status: 500 })
  }
}