// src/app/api/user/delete/route.ts
// SEC2: Guard su SUPABASE_SERVICE_ROLE_KEY
// C2:   Sostituisce console.error con logger
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { verifyCsrf } from '@/lib/csrf'
import { logger } from '@/lib/logger'
import { rateLimit } from '@/lib/rateLimit'

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60 * 60_000, prefix: 'user:delete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

  // SEC2: Guard esplicita — se la chiave non è configurata, abortiamo subito
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error('user/delete', 'SUPABASE_SERVICE_ROLE_KEY non configurata')
    return NextResponse.json(
      { error: 'Configurazione server non valida' },
      { status: 503, headers: rl.headers }
    )
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })
    }

    const csrf = verifyCsrf(request, user.id)
    if (!csrf.ok) {
      return NextResponse.json({ error: csrf.reason || 'Richiesta non autorizzata' }, { status: 403, headers: rl.headers })
    }

    const serviceClient = createServiceClient('user-delete:delete-own-account')

    await Promise.allSettled([
      serviceClient.from('user_media_entries').delete().eq('user_id', user.id),
      serviceClient.from('posts').delete().eq('user_id', user.id),
      serviceClient.from('likes').delete().eq('user_id', user.id),
      serviceClient.from('comments').delete().eq('user_id', user.id),
      serviceClient.from('follows').delete().eq('follower_id', user.id),
      serviceClient.from('follows').delete().eq('following_id', user.id),
      serviceClient.from('wishlist').delete().eq('user_id', user.id),
      serviceClient.from('notifications').delete().eq('receiver_id', user.id),
      serviceClient.from('notifications').delete().eq('sender_id', user.id),
      serviceClient.from('activity_log').delete().eq('user_id', user.id),
      serviceClient.from('steam_accounts').delete().eq('user_id', user.id),
      serviceClient.from('leaderboard').delete().eq('user_id', user.id),
      serviceClient.from('recommendations_cache').delete().eq('user_id', user.id),
    ])

    const { error } = await serviceClient.auth.admin.deleteUser(user.id)
    if (error) throw error

    return NextResponse.json({ success: true }, { headers: rl.headers })
  } catch (err) {
    // C2: usa logger invece di console.error
    logger.error('user/delete', err)
    return NextResponse.json({ error: 'Errore nella cancellazione' }, { status: 500, headers: rl.headers })
  }
}
