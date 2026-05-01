import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'list-items' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const listId = typeof body?.list_id === 'string' ? body.list_id : ''
  const mediaId = typeof body?.media_id === 'string' ? body.media_id : ''
  const mediaTitle = typeof body?.media_title === 'string' ? body.media_title.trim().slice(0, 300) : ''
  const mediaType = typeof body?.media_type === 'string' ? body.media_type : ''
  const mediaCover = typeof body?.media_cover === 'string' ? body.media_cover : null
  const position = Number.isFinite(body?.position) ? Number(body.position) : 0

  if (!listId || !mediaId || !mediaTitle || !mediaType) {
    return NextResponse.json({ error: 'payload incompleto' }, { status: 400, headers: rl.headers })
  }

  const { data: list } = await supabase.from('user_lists').select('id').eq('id', listId).eq('user_id', user.id).single()
  if (!list) return NextResponse.json({ error: 'Lista non trovata' }, { status: 404, headers: rl.headers })

  const { data, error } = await supabase
    .from('user_list_items')
    .insert({
      list_id: listId,
      user_id: user.id,
      media_id: mediaId,
      media_title: mediaTitle,
      media_type: mediaType,
      media_cover: mediaCover,
      position,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Elemento non aggiunto', code: error.code }, { status: 500, headers: rl.headers })
  return NextResponse.json({ success: true, item: data }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'list-items:delete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400, headers: rl.headers })

  const { error } = await supabase.from('user_list_items').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Elemento non rimosso' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
