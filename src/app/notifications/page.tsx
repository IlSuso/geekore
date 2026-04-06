import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Heart, UserPlus, MessageSquare, BellOff } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale'

const TYPE_CONFIG = {
  like: {
    icon: Heart,
    color: 'text-red-400',
    bg: 'bg-red-400/10 border-red-400/20',
    label: 'ha messo like al tuo post',
    dot: 'bg-red-400',
  },
  follow: {
    icon: UserPlus,
    color: 'text-violet-400',
    bg: 'bg-violet-400/10 border-violet-400/20',
    label: 'ha iniziato a seguirti',
    dot: 'bg-violet-400',
  },
  comment: {
    icon: MessageSquare,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/20',
    label: 'ha commentato il tuo post',
    dot: 'bg-blue-400',
  },
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*, sender:profiles!sender_id (username, display_name, avatar_url)')
    .eq('receiver_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Mark as read
  await supabase.from('notifications').update({ is_read: true }).eq('receiver_id', user.id)

  const unreadCount = notifications?.filter(n => n.is_read === false).length ?? 0

  return (
    <main className="min-h-screen bg-[#080810] text-white pt-6 pb-24 md:pb-10 px-4">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter">Notifiche</h1>
          <p className="text-zinc-600 text-sm mt-1">
            {notifications?.length ?? 0} attività recenti
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-violet-500/15 text-violet-400 text-xs font-bold rounded-full border border-violet-500/20">
                {unreadCount} nuove
              </span>
            )}
          </p>
        </div>

        {!notifications || notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900/60 border border-white/8 rounded-3xl flex items-center justify-center mb-4">
              <BellOff size={24} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-semibold">Nessuna notifica</p>
            <p className="text-zinc-700 text-sm mt-1">Le interazioni appariranno qui</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n: any) => {
              const config = TYPE_CONFIG[n.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.like
              const Icon = config.icon
              const timeAgo = n.created_at
                ? formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it })
                : ''

              return (
                <div
                  key={n.id}
                  className={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all ${
                    n.is_read === false
                      ? 'bg-violet-500/5 border-violet-500/15 hover:border-violet-500/30'
                      : 'bg-zinc-900/40 border-white/5 hover:border-white/10'
                  }`}
                >
                  {/* Unread dot */}
                  {n.is_read === false && (
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
                  )}

                  {/* Avatar */}
                  <Link href={`/profile/${n.sender?.username}`} className="shrink-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden ring-2 ring-white/5 hover:ring-violet-500/30 transition-all">
                      {n.sender?.avatar_url ? (
                        <img src={n.sender.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
                          {(n.sender?.display_name?.[0] || n.sender?.username?.[0] || '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-300 leading-snug">
                      <Link href={`/profile/${n.sender?.username}`} className="font-semibold text-white hover:text-violet-400 transition-colors">
                        {n.sender?.display_name || n.sender?.username}
                      </Link>
                      {' '}{config.label}
                    </p>
                    <p className="text-xs text-zinc-700 mt-0.5">{timeAgo}</p>
                  </div>

                  {/* Icon badge */}
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${config.bg}`}>
                    <Icon size={13} className={config.color} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
