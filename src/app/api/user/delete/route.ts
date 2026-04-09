import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Elimina tutti i dati utente prima dell'account
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

    // Elimina l'account da Supabase Auth
    const { error } = await serviceClient.auth.admin.deleteUser(user.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Delete account]', err)
    return NextResponse.json({ error: 'Errore nella cancellazione' }, { status: 500 })
  }
}