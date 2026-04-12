// src/app/api/user/export/route.ts
// 6.4 — Export dati utente per GDPR
// Restituisce un JSON con tutti i dati dell'utente: media, post, commenti, wishlist

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  // Rate limiting: massimo 3 export al giorno per utente
  const rl = rateLimit(request, { limit: 3, windowMs: 24 * 60 * 60 * 1000, prefix: 'user-export' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Puoi esportare i dati al massimo 3 volte al giorno.' },
      { status: 429, headers: rl.headers }
    )
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    // Carica tutti i dati in parallelo
    const [
      profileRes,
      mediaRes,
      postsRes,
      commentsRes,
      wishlistRes,
      followersRes,
      followingRes,
      notificationsRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('user_media_entries').select('*').eq('user_id', user.id),
      supabase.from('posts').select('id, content, image_url, created_at').eq('user_id', user.id),
      supabase.from('comments').select('id, content, created_at, post_id').eq('user_id', user.id),
      supabase.from('wishlist').select('*').eq('user_id', user.id),
      supabase.from('follows').select('following_id').eq('follower_id', user.id),
      supabase.from('follows').select('follower_id').eq('following_id', user.id),
      supabase.from('notifications').select('type, created_at, is_read').eq('receiver_id', user.id).order('created_at', { ascending: false }).limit(100),
    ])

    // Rimuovi campi sensibili dal profilo
    const profile = profileRes.data ? {
      username: profileRes.data.username,
      display_name: profileRes.data.display_name,
      bio: profileRes.data.bio,
      created_at: profileRes.data.created_at,
    } : null

    const exportData = {
      exported_at: new Date().toISOString(),
      account: {
        email: user.email,
        created_at: user.created_at,
        profile,
      },
      media_collection: mediaRes.data || [],
      posts: postsRes.data || [],
      comments: commentsRes.data || [],
      wishlist: wishlistRes.data || [],
      social: {
        following_count: (followingRes.data || []).length,
        followers_count: (followersRes.data || []).length,
      },
      notifications_sample: notificationsRes.data || [],
    }

    const json = JSON.stringify(exportData, null, 2)
    const filename = `geekore-export-${new Date().toISOString().split('T')[0]}.json`

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        ...Object.fromEntries(rl.headers.entries()),
      },
    })
  } catch (err) {
    logger.error('[User Export]', err)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
