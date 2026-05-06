import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import {
  MEDIA_TYPES,
  cleanRating,
  cleanStringArray,
  normalizeMediaCore,
} from '@/lib/mediaSanitizer'

const QUEUE_TABLES = ['swipe_queue_all', 'swipe_queue_anime', 'swipe_queue_manga', 'swipe_queue_movie', 'swipe_queue_tv', 'swipe_queue_game', 'swipe_queue_boardgame']

function normalizeItem(raw: any) {
  const core = normalizeMediaCore(raw)
  if (!core) return null

  return {
    external_id: core.external_id,
    title: core.title,
    type: core.type,
    cover_image: core.cover_image,
    genres: core.genres,
    episodes: core.episodes,
  }
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'onboarding:complete' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const accepted = Array.isArray(body?.accepted) ? body.accepted.slice(0, 100) : []
  const wishlist = Array.isArray(body?.wishlist) ? body.wishlist.slice(0, 100) : []
  const skipped = Array.isArray(body?.skipped) ? body.skipped.slice(0, 200) : []
  const selectedTypes = cleanStringArray(body?.selected_types, 12).filter(type => MEDIA_TYPES.has(type as any))

  const ts = Date.now()
  const mediaRows = accepted
    .map((entry: any, i: number) => {
      const item = normalizeItem(entry?.item)
      if (!item) return null
      return {
        user_id: user.id,
        ...item,
        status: 'completed',
        rating: cleanRating(entry?.rating),
        updated_at: new Date().toISOString(),
        display_order: ts - i * 1000,
      }
    })
    .filter(Boolean)

  if (mediaRows.length > 0) {
    const { error } = await supabase
      .from('user_media_entries')
      .upsert(mediaRows, { onConflict: 'user_id,external_id' })
    if (error) return NextResponse.json({ error: apiMessage(request, 'onboardingCollectionNotSaved') }, { status: 500, headers: rl.headers })
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
    if (error) return NextResponse.json({ error: apiMessage(request, 'onboardingWishlistNotSaved') }, { status: 500, headers: rl.headers })
  }

  const skippedRows = skipped
    .map((raw: any) => normalizeItem(raw))
    .filter(Boolean)
    .map((item: any) => ({ user_id: user.id, external_id: item.external_id, title: item.title, type: item.type }))

  if (skippedRows.length > 0) {
    const { error } = await supabase
      .from('swipe_skipped')
      .upsert(skippedRows, { onConflict: 'user_id,external_id' })
    if (error) return NextResponse.json({ error: apiMessage(request, 'onboardingSkipsNotSaved') }, { status: 500, headers: rl.headers })
  }

  const profileUpdate: Record<string, unknown> = { onboarding_done: true, onboarding_step: 3 }
  if (selectedTypes.length > 0) profileUpdate.preferred_types = selectedTypes

  const { error: profileError } = await supabase
    .from('profiles')
    .update(profileUpdate)
    .eq('id', user.id)
  if (profileError) return NextResponse.json({ error: apiMessage(request, 'onboardingProfileNotUpdated') }, { status: 500, headers: rl.headers })

  await Promise.all(QUEUE_TABLES.map(table => supabase.from(table).delete().eq('user_id', user.id)))

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
