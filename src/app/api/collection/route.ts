import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

const MEDIA_TYPES = new Set(['anime', 'manga', 'game', 'movie', 'tv', 'book', 'boardgame', 'board_game'])
const STATUSES = new Set(['watching', 'playing', 'reading', 'completed', 'planned', 'dropped', 'paused'])

function stringValue(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

function stringArray(value: unknown, maxItems = 80): string[] {
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

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 80, windowMs: 60_000, prefix: 'collection:add' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const externalId = stringValue(body?.external_id, 200)
  const title = stringValue(body?.title, 300)
  const type = stringValue(body?.type, 40)
  const status = stringValue(body?.status, 40) || 'watching'
  const shouldUpsert = body?.upsert === true

  if (!externalId) return NextResponse.json({ error: 'external_id mancante' }, { status: 400, headers: rl.headers })
  if (!title) return NextResponse.json({ error: 'title mancante' }, { status: 400, headers: rl.headers })
  if (!type || !MEDIA_TYPES.has(type)) return NextResponse.json({ error: 'type non valido' }, { status: 400, headers: rl.headers })
  if (!STATUSES.has(status)) return NextResponse.json({ error: 'status non valido' }, { status: 400, headers: rl.headers })

  const row = {
    user_id: user.id,
    external_id: externalId,
    title,
    title_en: stringValue(body?.title_en, 300) || title,
    type,
    cover_image: stringValue(body?.cover_image, 1000),
    genres: stringArray(body?.genres),
    tags: stringArray(body?.tags),
    authors: stringArray(body?.authors),
    keywords: stringArray(body?.keywords),
    studios: stringArray(body?.studios),
    directors: stringArray(body?.directors),
    developer: stringValue(body?.developer, 200),
    status,
    current_episode: numberOrNull(body?.current_episode),
    current_season: numberOrNull(body?.current_season),
    episodes: numberOrNull(body?.episodes),
    season_episodes: body?.season_episodes && typeof body.season_episodes === 'object' ? body.season_episodes : null,
    rating: numberOrNull(body?.rating),
    achievement_data: body?.achievement_data && typeof body.achievement_data === 'object' ? body.achievement_data : null,
    display_order: numberOrNull(body?.display_order) ?? Date.now(),
  }

  const query = shouldUpsert
    ? supabase.from('user_media_entries').upsert(row, { onConflict: 'user_id,external_id' })
    : supabase.from('user_media_entries').insert(row)

  const { data, error } = await query.select('id').single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Titolo già in collezione' }, { status: 409, headers: rl.headers })
    }
    return NextResponse.json({ error: 'Titolo non aggiunto' }, { status: 500, headers: rl.headers })
  }

  return NextResponse.json({ success: true, id: data?.id }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { limit: 80, windowMs: 60_000, prefix: 'collection:delete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const externalId = stringValue(body?.external_id, 200)
  if (!externalId) return NextResponse.json({ error: 'external_id mancante' }, { status: 400, headers: rl.headers })

  const { error } = await supabase
    .from('user_media_entries')
    .delete()
    .eq('user_id', user.id)
    .eq('external_id', externalId)

  if (error) return NextResponse.json({ error: 'Titolo non rimosso' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
