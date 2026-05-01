// src/app/api/xbox/games/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// Feature #22: Integrazione Xbox via OpenXBL API
//
// OpenXBL è un proxy ufficioso ma stabile delle Xbox Live API.
// Registra un account su https://xbl.io e ottieni una API key gratuita (fino a 500 req/mese).
//
// Variabili .env.local:
// OPENXBL_API_KEY=la-tua-chiave
//
// Tabella DB necessaria (aggiungere via SQL Editor Supabase):
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xbox_gamertag text;
// ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xbox_xuid text;
// ALTER TABLE user_media_entries ADD COLUMN IF NOT EXISTS achievement_data jsonb;
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

const OPENXBL_BASE = 'https://xbl.io/api/v2'

function openxblHeaders() {
  return {
    'X-Authorization': process.env.OPENXBL_API_KEY || '',
    'Accept': 'application/json',
    'Accept-Language': 'it-IT',
  }
}

function extractTitles(data: any): any[] {
  return (
    data?.content?.titles ||
    data?.content?.games ||
    data?.titles ||
    data?.games ||
    []
  )
}

async function resolveGamertag(gamertag: string): Promise<string | null> {
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

async function fetchXboxGames(xuid: string): Promise<any[]> {
  try {
    const res = await fetch(`${OPENXBL_BASE}/player/${xuid}/titleHistory`, {
      headers: openxblHeaders(),
      signal: AbortSignal.timeout(10000),
    })
    logger.info('Xbox', 'titleHistory response', { status: res.status })
    if (res.ok) {
      const data = await res.json()
      const titles = extractTitles(data)
      if (titles.length > 0) return titles
    } else {
      const text = await res.text()
      logger.warn('Xbox', 'titleHistory failed', { status: res.status, body: text.slice(0, 120) })
    }
  } catch (e) { logger.warn('Xbox', 'titleHistory exception', e) }

  try {
    const res = await fetch(`${OPENXBL_BASE}/achievements/player/${xuid}`, {
      headers: openxblHeaders(),
      signal: AbortSignal.timeout(10000),
    })
    logger.info('Xbox', 'achievements response', { status: res.status })
    if (!res.ok) {
      const text = await res.text()
      logger.warn('Xbox', 'achievements failed', { status: res.status, body: text.slice(0, 120) })
      return []
    }
    const data = await res.json()
    return extractTitles(data)
  } catch (e) {
    logger.warn('Xbox', 'achievements exception', e)
    return []
  }
}

function extractCoverImage(title: any): string | null {
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
  logger.info('Xbox', 'GET handler called')

  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, prefix: 'xbox-games' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste, aspetta un minuto.' }, { status: 429 })

  if (!process.env.OPENXBL_API_KEY) {
    logger.warn('Xbox', 'OPENXBL_API_KEY mancante')
    return NextResponse.json({ error: 'Xbox integration non configurata (OPENXBL_API_KEY mancante)' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  let xuid: string | null = searchParams.get('xuid')?.trim() ?? null
  logger.info('Xbox', 'xuid received', { hasXuid: !!xuid })
  const gamertag = searchParams.get('gamertag')?.trim()

  if (!xuid && !gamertag) {
    return NextResponse.json({ error: 'Parametro xuid o gamertag mancante' }, { status: 400 })
  }

  if (xuid && !/^\d{16}$/.test(xuid)) {
    return NextResponse.json({ error: 'XUID non valido: deve essere 16 cifre' }, { status: 400 })
  }

  if (!xuid && gamertag) {
    xuid = await resolveGamertag(gamertag)
    if (!xuid) {
      return NextResponse.json({
        error: `Gamertag "${gamertag}" non trovato. Inserisci il tuo XUID (16 cifre) da xboxgamertag.com`,
      }, { status: 404 })
    }
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch {}
      }

      try {
        await supabase.from('profiles').update({
          ...(gamertag ? { xbox_gamertag: gamertag } : {}),
          xbox_xuid: xuid,
        }).eq('id', user.id)

        send({ type: 'progress', step: 'fetch', current: 0, total: 0, message: 'Recupero giochi Xbox...' })

        const titles = await fetchXboxGames(xuid!)

        if (!titles.length) {
          send({ type: 'done', success: true, imported: 0, skipped: 0, total: 0,
            message: 'Nessun gioco trovato (il profilo potrebbe essere privato).' }); return
        }

        send({ type: 'progress', step: 'save', current: 0, total: 0, message: 'Salvataggio...' })

        const toInsert: any[] = []
        const skipped: string[] = []

        const { data: existing } = await supabase
          .from('user_media_entries')
          .select('external_id, rating, notes')
          .eq('user_id', user.id)
          .eq('type', 'game')

        const existingMap = new Map((existing || []).map(e => [e.external_id, e]))

        for (const title of titles) {
          const titleId = title.titleId?.toString() || title.id?.toString()
          if (!titleId) continue

          const extId = `xbox-${titleId}`
          if (existingMap.has(extId)) {
            skipped.push(title.name)
            continue
          }

          // Dati achievement annidati in title.achievement
          const ach = title.achievement || {}
          const currentAch: number = ach.currentAchievements || 0
          const totalAch: number = ach.totalAchievements || 0
          const currentGamerscore: number = ach.currentGamerscore || 0
          const totalGamerscore: number = ach.totalGamerscore || 0

          const hasProgress = currentGamerscore > 0
          const isCompleted = totalGamerscore > 0 && currentGamerscore >= totalGamerscore

          // achievement_data è un campo jsonb dedicato, separato dalle note utente
          const achievement_data = totalAch > 0
            ? { curr: currentAch, tot: totalAch, gs_curr: currentGamerscore, gs_tot: totalGamerscore }
            : null

          toInsert.push({
            user_id: user.id,
            external_id: extId,
            title: title.name,
            type: 'game',
            cover_image: extractCoverImage(title),
            status: isCompleted ? 'completed' : hasProgress ? 'watching' : 'wishlist',
            current_episode: null,
            genres: [],
            notes: null,
            achievement_data,
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
