import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

const QUEUE_TYPES = new Set(['all', 'anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])
const MEDIA_TYPES = new Set(['anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

function stringArray(value: unknown, maxItems = 60): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, maxItems)
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function boolValue(value: unknown): boolean {
  return value === true
}

function queueTable(queue: string): string {
  return queue === 'all' ? 'swipe_queue_all' : `swipe_queue_${queue}`
}

function toQueueRow(row: any, userId: string) {
  const externalId = cleanString(row?.external_id, 200)
  const title = cleanString(row?.title, 300)
  const type = cleanString(row?.type, 40)
  if (!externalId || !title || !type || !MEDIA_TYPES.has(type)) return null

  return {
    user_id: userId,
    external_id: externalId,
    title,
    type,
    cover_image: cleanString(row?.cover_image, 1000),
    year: numberOrNull(row?.year),
    genres: stringArray(row?.genres),
    score: numberOrNull(row?.score),
    description: cleanString(row?.description, 3000),
    why: cleanString(row?.why, 1000),
    match_score: numberOrNull(row?.match_score) ?? 0,
    episodes: numberOrNull(row?.episodes),
    authors: stringArray(row?.authors),
    developers: stringArray(row?.developers),
    platforms: stringArray(row?.platforms),
    is_award_winner: boolValue(row?.is_award_winner),
    is_discovery: boolValue(row?.is_discovery),
    source: cleanString(row?.source, 120),
  }
}

type QueueRow = NonNullable<ReturnType<typeof toQueueRow>>

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 120, windowMs: 60_000, prefix: 'swipe:queue' })
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

  const rows: QueueRow[] = body.rows
    .map((row: any) => toQueueRow(row, user.id))
    .filter((row: ReturnType<typeof toQueueRow>): row is QueueRow => Boolean(row))
    .slice(0, 100)
  if (rows.length === 0) return NextResponse.json({ success: true, inserted: 0 }, { headers: rl.headers })

  const { error } = await supabase
    .from(queueTable(queue))
    .upsert(rows, { onConflict: 'user_id,external_id' })

  if (error) return NextResponse.json({ error: 'queue non aggiornata' }, { status: 500, headers: rl.headers })

  if (body?.mirrorByType === true) {
    const types = [...new Set(rows.map(row => row.type))]
    await Promise.all(types.map(type => {
      const typedRows = rows.filter((row: any) => row.type === type)
      return supabase.from(queueTable(type)).upsert(typedRows, { onConflict: 'user_id,external_id' })
    }))
  }

  return NextResponse.json({ success: true, inserted: rows.length }, { headers: rl.headers })
}
