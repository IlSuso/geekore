import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import {
  cleanMediaType,
  cleanString,
  normalizeMediaCore,
} from '@/lib/mediaSanitizer'

const QUEUE_TYPES = new Set(['all', 'anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

function boolValue(value: unknown): boolean {
  return value === true
}

function queueTable(queue: string): string {
  return queue === 'all' ? 'swipe_queue_all' : `swipe_queue_${queue}`
}

function toQueueRow(row: any, userId: string) {
  const core = normalizeMediaCore(row)
  if (!core) return null

  const localized = row?.localized && typeof row.localized === 'object' ? row.localized : {}
  const sourceLocale = row?.sourceLocale === 'it' || row?.locale === 'it' || row?.language === 'it'
    ? 'it'
    : row?.sourceLocale === 'en' || row?.locale === 'en' || row?.language === 'en'
      ? 'en'
      : null

  return {
    user_id: userId,
    ...core,
    title_original: row?.title_original ?? row?.titleOriginal ?? core.title,
    // Non copiare automaticamente core.title in title_en/title_it: se la queue viene
    // riempita mentre l'app è in italiano/inglese, quel titolo localizzato finirebbe
    // indicizzato come se fosse entrambe le lingue. Salviamo nei campi lingua solo dati
    // davvero marcati come tali; /api/media/localize poi sceglie/recupera la lingua giusta.
    title_en: row?.title_en ?? row?.titleEn ?? localized?.en?.title ?? (sourceLocale === 'en' ? core.title : null),
    title_it: row?.title_it ?? row?.titleIt ?? localized?.it?.title ?? (sourceLocale === 'it' ? core.title : null),
    description_en: row?.description_en ?? row?.descriptionEn ?? localized?.en?.description ?? (sourceLocale === 'en' ? core.description : null),
    description_it: row?.description_it ?? row?.descriptionIt ?? localized?.it?.description ?? (sourceLocale === 'it' ? core.description : null),
    localized,
    is_award_winner: boolValue(row?.is_award_winner ?? row?.isAwardWinner),
    is_discovery: boolValue(row?.is_discovery ?? row?.isDiscovery),
  }
}

type QueueRow = NonNullable<ReturnType<typeof toQueueRow>>

function compactQueueRow(row: QueueRow) {
  // Versione compatibile con schema queue vecchio/minimo.
  // Serve quando Supabase non ha ancora colonne nuove tipo localized/title_en/description_en.
  return {
    user_id: row.user_id,
    external_id: row.external_id,
    title: row.title,
    type: row.type,
    cover_image: row.cover_image,
    genres: row.genres,
    year: row.year,
    score: row.score,
    episodes: row.episodes,
    match_score: row.match_score,
    why: row.why,
    source: row.source,
    inserted_at: (row as any).inserted_at,
  }
}

function queueErrorPayload(error: any) {
  return {
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
  }
}

async function upsertQueueRows(supabase: Awaited<ReturnType<typeof createClient>>, table: string, rows: QueueRow[]) {
  if (rows.length === 0) return { inserted: 0, degraded: false, error: null as any }

  const full = await supabase
    .from(table)
    .upsert(rows, { onConflict: 'user_id,external_id' })

  if (!full.error) return { inserted: rows.length, degraded: false, error: null as any }

  // Se lo schema queue non contiene ancora alcune colonne nuove, proviamo con
  // un payload minimo invece di far fallire tutta Swipe con HTTP 500.
  const compactRows = rows.map(compactQueueRow)
  const compact = await supabase
    .from(table)
    .upsert(compactRows, { onConflict: 'user_id,external_id' })

  if (!compact.error) {
    console.warn('[swipe/queue] full upsert failed, compact upsert used', table, queueErrorPayload(full.error))
    return { inserted: compactRows.length, degraded: true, error: full.error }
  }

  console.warn('[swipe/queue] queue upsert skipped after errors', table, {
    full: queueErrorPayload(full.error),
    compact: queueErrorPayload(compact.error),
  })

  // La queue è solo cache/preload: non deve mai bloccare la Swipe page.
  return { inserted: 0, degraded: true, error: compact.error }
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 120, windowMs: 60_000, prefix: 'swipe:queue' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const queue = cleanString(body?.queue, 40) || 'all'
  if (!QUEUE_TYPES.has(queue)) return NextResponse.json({ error: 'queue non valida' }, { status: 400, headers: rl.headers })
  if (!Array.isArray(body?.rows)) return NextResponse.json({ error: 'rows mancanti' }, { status: 400, headers: rl.headers })

  const now = Date.now()
  const rows: QueueRow[] = body.rows
    .map((row: any, index: number) => {
      const queueRow = toQueueRow(row, user.id)
      if (!queueRow) return null

      // Mantiene stabile l'ordine deciso a monte dal caller anche quando Supabase
      // inserisce più righe nello stesso batch. Senza questo, molti record possono
      // avere lo stesso inserted_at e la SELECT successiva può tornare in ordine variabile.
      return {
        ...queueRow,
        inserted_at: new Date(now + index).toISOString(),
      } as QueueRow
    })
    .filter((row: ReturnType<typeof toQueueRow> | null): row is QueueRow => Boolean(row))
    .slice(0, 100)
  if (rows.length === 0) return NextResponse.json({ success: true, inserted: 0 }, { headers: rl.headers })

  const primary = await upsertQueueRows(supabase, queueTable(queue), rows)
  let mirrorDegraded = false

  if (body?.mirrorByType === true) {
    const types = [...new Set(rows.map(row => row.type))]
      .filter(type => cleanMediaType(type) !== null)

    const mirrors = await Promise.allSettled(types.map(async (type) => {
      const typedRows = rows.filter((row: any) => row.type === type)
      return upsertQueueRows(supabase, queueTable(type), typedRows)
    }))

    mirrorDegraded = mirrors.some(result =>
      result.status === 'rejected' || result.value.degraded,
    )
  }

  return NextResponse.json({
    success: true,
    inserted: primary.inserted,
    degraded: primary.degraded || mirrorDegraded,
  }, { headers: rl.headers })
}
