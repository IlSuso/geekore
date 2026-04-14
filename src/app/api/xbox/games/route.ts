// DESTINAZIONE: src/app/api/xbox/games/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// Feature #22: Integrazione Xbox via OpenXBL API
//
// OpenXBL è un proxy ufficioso ma stabile delle Xbox Live API.
// Registra un account su https://xbl.io e ottieni una API key gratuita (fino a 500 req/mese).
//
// Variabili .env.local:
// OPENXBL_API_KEY=la-tua-chiave
//
// Il flusso è simpler rispetto a Steam: l'utente inserisce il proprio Gamertag
// e noi lo risolviamo in XUID, poi recuperiamo i giochi.
//
// Tabella DB necessaria (aggiungere via SQL Editor Supabase):
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xbox_gamertag text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xbox_xuid text;
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
  // Prova endpoint title history (più completo)
  try {
    const res = await fetch(`${OPENXBL_BASE}/player/${xuid}/titleHistory`, {
      headers: openxblHeaders(),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = await res.json()
      const titles = data?.titles || data?.games || []
      if (titles.length > 0) return titles
    }
  } catch { /* prova fallback */ }

  // Fallback: endpoint achievements
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

function extractCoverImage(title: any): string | null {
  // Prova i campi immagine nell-ordine di preferenza
  const candidates = [
    title.displayImage,
    title.image,
    title.coverImage,
    title.thumbnail,
    title.images?.find((i: any) => i.type === 'BoxArt')?.url,
    title.images?.find((i: any) => i.type === 'Tile')?.url,
    title.images?.[0]?.url,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.startsWith('http')) return c
  }
  return null
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

  // Accetta XUID diretto (piano gratuito OpenXBL non supporta ricerca gamertag altrui)
  // o gamertag come fallback per piani a pagamento
  let xuid = searchParams.get('xuid')?.trim()
  const gamertag = searchParams.get('gamertag')?.trim()

  if (!xuid && !gamertag) {
    return NextResponse.json({ error: 'Parametro xuid o gamertag mancante' }, { status: 400 })
  }

  // Valida XUID: deve essere 16 cifre
  if (xuid && !/^\d{16}$/.test(xuid)) {
    return NextResponse.json({ error: 'XUID non valido: deve essere 16 cifre' }, { status: 400 })
  }

  // Se passato gamertag invece di XUID, prova a risolverlo
  if (!xuid && gamertag) {
    xuid = await resolveGamertag(gamertag) ?? undefined
    if (!xuid) {
      return NextResponse.json({
        error: `Gamertag "${gamertag}" non trovato. Inserisci il tuo XUID (16 cifre) da xboxgamertag.com`,
      }, { status: 404 })
    }
  }

  // ── Streaming response ──────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch {}
      }

      try {
        // Salva xuid sul profilo
        await supabase.from('profiles').update({
          ...(gamertag ? { xbox_gamertag: gamertag } : {}),
          xbox_xuid: xuid,
        }).eq('id', user.id)

        send({ type: 'progress', step: 'fetch', current: 0, total: 0, message: 'Recupero giochi Xbox...' })

        // Recupera giochi
        const titles = await fetchXboxGames(xuid!)

        if (!titles.length) {
          send({ type: 'done', success: true, imported: 0, skipped: 0, total: 0,
            message: 'Nessun gioco trovato (il profilo potrebbe essere privato).' }); return
        }

        send({ type: 'progress', step: 'save', current: 0, total: 0, message: 'Salvataggio...' })

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

          const gamerscore = title.currentGamerscore || 0
          const estimatedHours = Math.max(1, Math.round(gamerscore / 10))
          const maxGamerscore = title.maxGamerscore || 0
          const isCompleted = maxGamerscore > 0 && gamerscore >= maxGamerscore
          const completionPct = maxGamerscore > 0 ? Math.round((gamerscore / maxGamerscore) * 100) : 0

          toInsert.push({
            user_id: user.id,
            external_id: extId,
            title: title.name,
            type: 'game',
            cover_image: extractCoverImage(title),
            status: isCompleted ? 'completed' : gamerscore > 0 ? 'watching' : 'wishlist',
            current_episode: estimatedHours,
            genres: [],
            notes: `Gamerscore: ${gamerscore}/${maxGamerscore} (${completionPct}%)`,
            updated_at: new Date().toISOString(),
            display_order: Date.now() - toInsert.length * 1000,
          })
        }

        if (toInsert.length > 0) {
          const BATCH = 50
          for (let i = 0; i < toInsert.length; i += BATCH) {
            const { error: insertError } = await supabase
              .from('user_media_entries')
              .insert(toInsert.slice(i, i + BATCH))
            if (insertError) {
              send({ type: 'error', message: `Errore salvataggio: ${insertError.message}` })
              controller.close()
              return
            }
          }
        }

        send({
          type: 'done',
          success: true,
          imported: toInsert.length,
          skipped: skipped.length,
          total: titles.length,
          gamertag,
          xuid,
          message: `${toInsert.length} giochi Xbox importati`,
        })
      } catch (e: any) {
        send({ type: 'error', message: e.message || 'Errore durante il recupero dei giochi Xbox' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      ...rl.headers,
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    },
  })
}