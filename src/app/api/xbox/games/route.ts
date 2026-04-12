// DESTINAZIONE: src/app/api/xbox/games/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// Feature #22: Integrazione Xbox via OpenXBL API
//
// OpenXBL è un proxy ufficioso ma stabile delle Xbox Live API.
// Registra un account su https://xbl.io e ottieni una API key gratuita (fino a 500 req/mese).
//
// Variabili .env.local:
//   OPENXBL_API_KEY=la-tua-chiave
//
// Il flusso è simpler rispetto a Steam: l'utente inserisce il proprio Gamertag
// e noi lo risolviamo in XUID, poi recuperiamo i giochi.
//
// Tabella DB necessaria (aggiungere via SQL Editor Supabase):
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xbox_gamertag text;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xbox_xuid text;
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const OPENXBL_BASE = 'https://xbl.io/api/v2'

function openxblHeaders() {
  return {
    'X-Authorization': process.env.OPENXBL_API_KEY || '',
    'Accept': 'application/json',
    'Accept-Language': 'it-IT',
  }
}

// Risolve gamertag → XUID
// OpenXBL endpoint corretto: GET /profile/gamertag/{gamertag}
async function resolveGamertag(gamertag: string): Promise<string | null> {
  // Strategia 1: endpoint profilo diretto (più affidabile)
  try {
    const res = await fetch(`${OPENXBL_BASE}/profile/gamertag/${encodeURIComponent(gamertag)}`, {
      headers: openxblHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      const profile =
        data?.profileUsers?.[0] ||
        data?.people?.[0] ||
        data?.profile ||
        data
      const xuid =
        profile?.id ||
        profile?.xuid ||
        profile?.settings?.find?.((s: any) => s.id === 'Xuid')?.value
      if (xuid) return String(xuid)
    }
  } catch { /* prova strategia 2 */ }

  // Strategia 2: endpoint search (fallback)
  try {
    const res = await fetch(`${OPENXBL_BASE}/friends/search?gt=${encodeURIComponent(gamertag)}`, {
      headers: openxblHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      const profile = data?.profileUsers?.[0] || data?.people?.[0]
      const xuid = profile?.id || profile?.xuid
      if (xuid) return String(xuid)
    }
  } catch { /* fallisce */ }

  return null
}
// Recupera lista giochi per XUID
async function fetchXboxGames(xuid: string): Promise<any[]> {
  try {
    const res = await fetch(`${OPENXBL_BASE}/achievements/player/${xuid}`, {
      headers: openxblHeaders(),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data?.titles || []
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, prefix: 'xbox-games' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste, aspetta un minuto.' }, { status: 429 })

  if (!process.env.OPENXBL_API_KEY) {
    return NextResponse.json({ error: 'Xbox integration non configurata (OPENXBL_API_KEY mancante)' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const gamertag = searchParams.get('gamertag')?.trim()
  if (!gamertag) return NextResponse.json({ error: 'gamertag mancante' }, { status: 400 })

  // Risolvi XUID
  const xuid = await resolveGamertag(gamertag)
  if (!xuid) {
    return NextResponse.json({ error: `Gamertag "${gamertag}" non trovato. Controlla che il profilo Xbox sia pubblico.` }, { status: 404 })
  }

  // Salva gamertag + xuid sul profilo
  await supabase.from('profiles').update({ xbox_gamertag: gamertag, xbox_xuid: xuid }).eq('id', user.id)

  // Recupera giochi
  const titles = await fetchXboxGames(xuid)
  if (!titles.length) {
    return NextResponse.json({ success: true, games: [], message: 'Nessun gioco trovato (il profilo potrebbe essere privato).' })
  }

  // Normalizza e importa nella collezione
  const toInsert: any[] = []
  const skipped: string[] = []

  // Leggi titoli già in collezione per evitare duplicati
  const { data: existing } = await supabase
    .from('user_media_entries')
    .select('external_id')
    .eq('user_id', user.id)
    .eq('type', 'game')

  const existingIds = new Set((existing || []).map(e => e.external_id).filter(Boolean))

  for (const title of titles) {
    const titleId = title.titleId?.toString() || title.id?.toString()
    if (!titleId) continue

    const extId = `xbox-${titleId}`
    if (existingIds.has(extId)) {
      skipped.push(title.name)
      continue
    }

    // Calcola ore stimate dagli achievement (approssimazione: gamerscore / 10 = ore)
    const gamerscore = title.currentGamerscore || 0
    const estimatedHours = Math.max(1, Math.round(gamerscore / 10))

    // Determina se completato (100% achievement)
    const maxGamerscore = title.maxGamerscore || 0
    const isCompleted = maxGamerscore > 0 && gamerscore >= maxGamerscore
    const completionPct = maxGamerscore > 0 ? Math.round((gamerscore / maxGamerscore) * 100) : 0

    toInsert.push({
      user_id: user.id,
      external_id: extId,
      title: title.name,
      type: 'game',
      cover_image: title.displayImage || title.mediaItemType || null,
      status: isCompleted ? 'completed' : gamerscore > 0 ? 'playing' : 'wishlist',
      current_episode: estimatedHours,
      genres: [],  // Xbox API non fornisce generi direttamente
      notes: `Gamerscore: ${gamerscore}/${maxGamerscore} (${completionPct}%)`,
      updated_at: new Date().toISOString(),
      display_order: Date.now() - toInsert.length * 1000,
    })
  }

  if (toInsert.length > 0) {
    const BATCH = 50
    for (let i = 0; i < toInsert.length; i += BATCH) {
      await supabase.from('user_media_entries').upsert(toInsert.slice(i, i + BATCH), { onConflict: 'user_id,external_id' })
    }
  }

  return NextResponse.json({
    success: true,
    imported: toInsert.length,
    skipped: skipped.length,
    total: titles.length,
    gamertag,
    xuid,
    games: toInsert.map(g => ({ title: g.title, status: g.status, hours: g.current_episode })),
  }, { headers: rl.headers })
}