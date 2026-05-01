import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/rateLimit'
import { checkOrigin } from '@/lib/csrf'

function cleanContent(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\n{3,}/g, '\n\n').slice(0, 500)
}

function cleanCategory(value: unknown) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().slice(0, 120)
  return cleaned || null
}

function cleanImageUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (!cleaned) return null
  try {
    const url = new URL(cleaned)
    if (url.protocol !== 'https:') return null
    return cleaned.slice(0, 1000)
  } catch {
    return null
  }
}

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'post-create' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi post. Rallenta.' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403 })

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const content = cleanContent(body.content)
  const imageUrl = cleanImageUrl(body.image_url)
  const category = cleanCategory(body.category)
  if (!content && !imageUrl) return NextResponse.json({ error: 'contenuto mancante' }, { status: 400 })

  const service = createServiceClient('social:post:create')
  const { data, error } = await service
    .from('posts')
    .insert({ user_id: user.id, content, image_url: imageUrl, category })
    .select('id, content, image_url, created_at, category')
    .single()

  if (error) return NextResponse.json({ error: 'post non salvato' }, { status: 500 })
  return NextResponse.json({ success: true, post: data }, { headers: rl.headers })
}

export async function PATCH(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'post-edit' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe modifiche. Rallenta.' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403 })

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const postId = body.post_id
  const content = cleanContent(body.content)
  if (!postId || typeof postId !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })
  if (!content) return NextResponse.json({ error: 'contenuto mancante' }, { status: 400 })

  const service = createServiceClient('social:post:edit')
  const { data, error } = await service
    .from('posts')
    .update({ content, is_edited: true })
    .eq('id', postId)
    .eq('user_id', user.id)
    .select('id, content, is_edited')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'post non modificato' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'post non trovato' }, { status: 404 })
  return NextResponse.json({ success: true, post: data }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'post-delete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe cancellazioni. Rallenta.' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403 })

  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const postId = body.post_id
  if (!postId || typeof postId !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })

  const service = createServiceClient('social:post:delete')
  const { data: post } = await service
    .from('posts')
    .select('id')
    .eq('id', postId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!post) return NextResponse.json({ error: 'post non trovato' }, { status: 404 })

  await service.from('notifications').delete().eq('post_id', postId)
  await service.from('comments').delete().eq('post_id', postId)
  await service.from('likes').delete().eq('post_id', postId)
  const { error } = await service.from('posts').delete().eq('id', postId).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'post non cancellato' }, { status: 500 })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
