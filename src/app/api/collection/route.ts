import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import {
  MEDIA_TYPES_WITH_LEGACY,
  cleanHttpsUrl,
  cleanRating,
  cleanString,
  cleanStringArray,
  numberOrNull,
  positiveNumberOrNull,
  normalizeMediaCore,
} from '@/lib/mediaSanitizer'

const STATUSES = new Set(['watching', 'playing', 'reading', 'completed', 'planned', 'dropped', 'paused'])
const NUMERIC_UPDATE_FIELDS = new Set(['current_episode', 'current_season', 'episodes', 'rating', 'display_order'])

function updatePayload(body: any): Record<string, unknown> {
  const update: Record<string, unknown> = {}

  if ('status' in body) {
    const status = cleanString(body.status, 40)
    if (status && STATUSES.has(status)) update.status = status
  }
  if ('notes' in body) {
    update.notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 5000) : null
  }
  if ('completed_at' in body) {
    update.completed_at = typeof body.completed_at === 'string' || body.completed_at === null ? body.completed_at : null
  }
  for (const field of NUMERIC_UPDATE_FIELDS) {
    if (field in body) {
      if (field === 'rating') update[field] = cleanRating(body[field])
      else if (field === 'episodes') update[field] = positiveNumberOrNull(body[field])
      else update[field] = numberOrNull(body[field])
    }
  }

  return update
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 80, windowMs: 60_000, prefix: 'collection:add' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const core = normalizeMediaCore(body, { allowLegacyTypes: true })
  const status = cleanString(body?.status, 40) || 'watching'
  const shouldUpsert = body?.upsert === true

  if (!core?.external_id) return NextResponse.json({ error: 'external_id mancante' }, { status: 400, headers: rl.headers })
  if (!core.title) return NextResponse.json({ error: 'title mancante' }, { status: 400, headers: rl.headers })
  if (!core.type || !MEDIA_TYPES_WITH_LEGACY.has(core.type)) return NextResponse.json({ error: 'type non valido' }, { status: 400, headers: rl.headers })
  if (!STATUSES.has(status)) return NextResponse.json({ error: 'status non valido' }, { status: 400, headers: rl.headers })

  const row = {
    user_id: user.id,
    external_id: core.external_id,
    title: core.title,
    title_en: cleanString(body?.title_en, 300) || core.title,
    type: core.type,
    cover_image: cleanHttpsUrl(body?.cover_image),
    genres: core.genres,
    tags: cleanStringArray(body?.tags),
    authors: cleanStringArray(body?.authors),
    keywords: cleanStringArray(body?.keywords),
    studios: cleanStringArray(body?.studios),
    directors: cleanStringArray(body?.directors),
    developer: cleanString(body?.developer, 200),
    status,
    current_episode: numberOrNull(body?.current_episode),
    current_season: numberOrNull(body?.current_season),
    episodes: positiveNumberOrNull(body?.episodes),
    season_episodes: body?.season_episodes && typeof body.season_episodes === 'object' ? body.season_episodes : null,
    rating: cleanRating(body?.rating),
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
  const rl = await rateLimitAsync(request, { limit: 80, windowMs: 60_000, prefix: 'collection:delete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const id = cleanString(body?.id, 100)
  const externalId = cleanString(body?.external_id, 200)
  if (!id && !externalId) return NextResponse.json({ error: 'id o external_id mancante' }, { status: 400, headers: rl.headers })

  let query = supabase
    .from('user_media_entries')
    .delete()
    .eq('user_id', user.id)

  query = id ? query.eq('id', id) : query.eq('external_id', externalId)

  const { error } = await query

  if (error) return NextResponse.json({ error: 'Titolo non rimosso' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}

export async function PATCH(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 120, windowMs: 60_000, prefix: 'collection:update' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const id = cleanString(body?.id, 100)
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400, headers: rl.headers })

  const update = updatePayload(body)
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nessun campo valido da aggiornare' }, { status: 400, headers: rl.headers })
  }

  const { error } = await supabase
    .from('user_media_entries')
    .update(update)
    .eq('user_id', user.id)
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Titolo non aggiornato' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
