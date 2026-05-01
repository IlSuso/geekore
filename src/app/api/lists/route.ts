import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

function cleanListPayload(body: any) {
  return {
    title: typeof body?.title === 'string' ? body.title.trim().slice(0, 100) : '',
    description: typeof body?.description === 'string' ? body.description.trim().slice(0, 500) || null : null,
    is_public: typeof body?.is_public === 'boolean' ? body.is_public : true,
  }
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'lists' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const payload = cleanListPayload(body)
  if (!payload.title) return NextResponse.json({ error: 'title mancante' }, { status: 400, headers: rl.headers })

  const { data, error } = await supabase
    .from('user_lists')
    .insert({ ...payload, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Lista non salvata' }, { status: 500, headers: rl.headers })
  return NextResponse.json({ success: true, list: data }, { headers: rl.headers })
}

export async function PUT(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'lists:update' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const id = typeof body?.id === 'string' ? body.id : ''
  const payload = cleanListPayload(body)
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400, headers: rl.headers })
  if (!payload.title) return NextResponse.json({ error: 'title mancante' }, { status: 400, headers: rl.headers })

  const { data, error } = await supabase
    .from('user_lists')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Lista non aggiornata' }, { status: 500, headers: rl.headers })
  return NextResponse.json({ success: true, list: data }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'lists:delete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id mancante' }, { status: 400, headers: rl.headers })

  const { error } = await supabase.from('user_lists').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Lista non eliminata' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
