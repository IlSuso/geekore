import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'

const MEDIA_TYPES = new Set(['anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])
const QUEUE_TABLES = ['swipe_queue_all', 'swipe_queue_anime', 'swipe_queue_manga', 'swipe_queue_movie', 'swipe_queue_tv', 'swipe_queue_game', 'swipe_queue_boardgame']

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

function normalizeItem(raw: any) {
  const externalId = cleanString(raw?.id ?? raw?.external_id, 200)
  const title = cleanString(raw?.title, 300)
  const type = cleanString(raw?.type, 40)
  if (!externalId || !title || !type || !MEDIA_TYPES.has(type)) return null
  return {
    external_id: externalId,
    title,
    type,
    cover_image: cleanString(raw?.coverImage ?? raw?.cover_image, 1000),
    genres: stringArray(raw?.genres),
    episodes: numberOrNull(raw?.episodes),
  }
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'onboarding:complete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const accepted = Array.isArray(body?.accepted) ? body.accepted.slice(0, 100) : []
  const wishlist = Array.isArray(body?.wishlist) ? body.wishlist.slice(0, 100) : []
  const skipped = Array.isArray(body?.skipped) ? body.skipped.slice(0, 200) : []
  const selectedTypes = stringArray(body?.selected_types, 12).filter(type => MEDIA_TYPES.has(type))

  const ts = Date.now()
  const mediaRows = accepted
    .map((entry: any, i: number) => {
      const item = normalizeItem(entry?.item)
      if (!item) return null
      return {
        user_id: user.id,
        ...item,
        status: 'completed',
        rating: numberOrNull(entry?.rating),
        updated_at: new Date().toISOString(),
        display_order: ts - i * 1000,
      }
    })
    .filter(Boolean)

  if (mediaRows.length > 0) {
    const { error } = await supabase
      .from('user_media_entries')
      .upsert(mediaRows, { onConflict: 'user_id,external_id' })
    if (error) return NextResponse.json({ error: 'Collezione onboarding non salvata' }, { status: 500, headers: rl.headers })
  }

  const wishlistRows = wishlist
    .map((raw: any) => {
      const item = normalizeItem(raw)
      return item ? { user_id: user.id, ...item } : null
    })
    .filter(Boolean)

  if (wishlistRows.length > 0) {
    const { error } = await supabase
      .from('wishlist')
      .upsert(wishlistRows, { onConflict: 'user_id,external_id' })
    if (error) return NextResponse.json({ error: 'Wishlist onboarding non salvata' }, { status: 500, headers: rl.headers })
  }

  const skippedRows = skipped
    .map((raw: any) => normalizeItem(raw))
    .filter(Boolean)
    .map((item: any) => ({ user_id: user.id, external_id: item.external_id, title: item.title, type: item.type }))

  if (skippedRows.length > 0) {
    const { error } = await supabase
      .from('swipe_skipped')
      .upsert(skippedRows, { onConflict: 'user_id,external_id' })
    if (error) return NextResponse.json({ error: 'Skip onboarding non salvati' }, { status: 500, headers: rl.headers })
  }

  const profileUpdate: Record<string, unknown> = { onboarding_done: true, onboarding_step: 3 }
  if (selectedTypes.length > 0) profileUpdate.preferred_types = selectedTypes

  const { error: profileError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id)
  if (profileError) return NextResponse.json({ error: 'Profilo onboarding non aggiornato' }, { status: 500, headers: rl.headers })

  await Promise.all(QUEUE_TABLES.map(table => supabase.from(table).delete().eq('user_id', user.id)))

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
