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
  },
  follow: {
    icon: UserPlus,
    color: 'text-violet-400',
    bg: 'bg-violet-400/10 border-violet-400/20',
    label: 'ha iniziato a seguirti',
  },
  comment: {
    icon: MessageSquare,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10 border-blue-400/20',
    label: 'ha commentato il tuo post',
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

  return (
    <main className="min-h-screen bg-zinc-950 pt-6 pb-24 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Notifiche</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {notifications?.length ?? 0} attività recenti
          </p>
        </div>

        {!notifications || notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mb-4">
              <BellOff size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-medium">Nessuna notifica</p>
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
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                    n.is_read === false
                      ? 'bg-violet-500/5 border-violet-500/20'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  {/* Avatar */}
                  <Link href={`/profile/${n.sender?.username}`} className="shrink-0">
                    <div className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-zinc-800">
                      {n.sender?.avatar_url ? (
                        <img src={n.sender.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
                          {(n.sender?.display_name?.[0] || n.sender?.username?.[0] || '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 leading-snug">
                      <Link href={`/profile/${n.sender?.username}`} className="font-semibold text-white hover:text-violet-400 transition-colors">
                        {n.sender?.display_name || n.sender?.username}
                      </Link>
                      {' '}{config.label}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">{timeAgo}</p>
                  </div>

                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${config.bg}`}>
                    <Icon size={14} className={config.color} />
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
