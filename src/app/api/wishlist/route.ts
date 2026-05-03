import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import {
  MEDIA_TYPES_WITH_LEGACY,
  cleanString,
  normalizeMediaCore,
} from '@/lib/mediaSanitizer'

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

  const { error } = await supabase.from('wishlist').upsert({
    user_id: user.id,
    external_id: core.external_id,
    title: core.title,
    type: core.type,
    cover_image: core.cover_image,
    genres: core.genres,
  }, { onConflict: 'user_id,external_id' })

  if (error) return NextResponse.json({ error: 'Wishlist non aggiornata' }, { status: 500, headers: rl.headers })
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
