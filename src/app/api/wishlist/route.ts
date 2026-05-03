import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import {
  MEDIA_TYPES_WITH_LEGACY,
  cleanString,
  normalizeMediaCore,
} from '@/lib/mediaSanitizer'

function localizedPayload(body: any, core: any) {
  return {
    title_original: cleanString(body?.title_original, 300) || core.title,
    title_en: cleanString(body?.title_en, 300) || core.title,
    title_it: cleanString(body?.title_it, 300),
    description_en: typeof body?.description_en === 'string' ? body.description_en : null,
    description_it: typeof body?.description_it === 'string' ? body.description_it : null,
    localized: body?.localized && typeof body.localized === 'object' ? body.localized : {},
  }
}

async function upsertWishlist(supabase: any, row: Record<string, unknown>) {
  const full = row
  const minimal = {
    user_id: row.user_id,
    external_id: row.external_id,
    title: row.title,
    type: row.type,
    cover_image: row.cover_image,
  }
  const tiny = {
    user_id: row.user_id,
    external_id: row.external_id,
    title: row.title,
    type: row.type,
  }

  const attempts = [full, minimal, tiny]
  let lastError: any = null

  for (const payload of attempts) {
    const { data: existing, error: selectError } = await supabase
      .from('wishlist')
      .select('id')
      .eq('user_id', row.user_id)
      .eq('external_id', row.external_id)
      .maybeSingle()

    if (selectError && selectError.code !== 'PGRST116') {
      lastError = selectError
      continue
    }

    if (existing?.id) {
      const { error } = await supabase
        .from('wishlist')
        .update(payload)
        .eq('user_id', row.user_id)
        .eq('external_id', row.external_id)
      if (!error) return null
      lastError = error
      continue
    }

    const { error } = await supabase.from('wishlist').insert(payload)
    if (!error) return null
    lastError = error
  }

  return lastError
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'wishlist' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const core = normalizeMediaCore(body, { allowLegacyTypes: true })

  if (!core?.external_id) return NextResponse.json({ error: 'external_id mancante' }, { status: 400, headers: rl.headers })
  if (!core.title) return NextResponse.json({ error: 'title mancante' }, { status: 400, headers: rl.headers })
  if (!core.type || !MEDIA_TYPES_WITH_LEGACY.has(core.type)) return NextResponse.json({ error: 'type non valido' }, { status: 400, headers: rl.headers })

  const row = {
    user_id: user.id,
    external_id: core.external_id,
    title: core.title,
    type: core.type,
    cover_image: core.cover_image,
    genres: core.genres,
    ...localizedPayload(body, core),
  }

  const error = await upsertWishlist(supabase, row)
  if (error) {
    console.error('[wishlist] save failed', error)
    return NextResponse.json({ error: 'Wishlist non aggiornata' }, { status: 500, headers: rl.headers })
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'wishlist:delete' })
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

  let query = supabase.from('wishlist').delete().eq('user_id', user.id)
  query = id ? query.eq('id', id) : query.eq('external_id', externalId)
  const { error } = await query

  if (error) return NextResponse.json({ error: 'Elemento non rimosso' }, { status: 500, headers: rl.headers })
  return NextResponse.json({ success: true }, { headers: rl.headers })
}
