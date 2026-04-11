'use client'
// src/app/notifications/page.tsx
// Aggiunge badge PWA (navigator.setAppBadge) e clearBadge alla lettura.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Heart, UserPlus, MessageSquare, BellOff, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { FollowBackButton } from '@/components/notifications/FollowBackButton'
import { useLocale } from '@/lib/locale'

// ── Badge PWA helper ───────────────────────────────────────────────────────────
function setAppBadge(count: number) {
  if (typeof navigator === 'undefined') return
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      (navigator as any).setAppBadge(count).catch(() => {})
    } else {
      (navigator as any).clearAppBadge().catch(() => {})
    }
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { locale, t } = useLocale()
  const n = t.notifications

  const TYPE_CONFIG = {
    like:    { icon: Heart,         color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',       label: n.likeAction    },
    follow:  { icon: UserPlus,      color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/20', label: n.followAction  },
    comment: { icon: MessageSquare, color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',    label: n.commentAction },
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }

      const { data } = await supabase
        .from('notifications')
        .select('*, sender:profiles!sender_id (id, username, display_name, avatar_url)')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

      setNotifications(data || [])
      setLoading(false)

      const unreadIds = (data || []).filter((n: any) => !n.is_read).map((n: any) => n.id)

      // Azzera badge PWA quando l'utente apre le notifiche
      setAppBadge(0)

      if (unreadIds.length > 0) {
        await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
      }
    }
    load()
  }, [])

  return (
    <main className="min-h-screen bg-zinc-950 pt-6 pb-24 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{n.title}</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {loading ? '…' : n.recentActivity(notifications.length)}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 size={28} className="animate-spin text-violet-400" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mb-4">
              <BellOff size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-medium">{n.empty}</p>
            <p className="text-zinc-700 text-sm mt-1">{n.emptyHint}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif: any) => {
              const config = TYPE_CONFIG[notif.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.like
              const Icon = config.icon
              const timeAgo = notif.created_at
                ? formatDistanceToNow(new Date(notif.created_at), {
                    addSuffix: true,
                    locale: locale === 'en' ? enUS : it,
                  })
                : ''

              return (
                <div key={notif.id}
                  className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                    notif.is_read === false
                      ? 'bg-violet-500/5 border-violet-500/20'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <Link href={`/profile/${notif.sender?.username}`} className="shrink-0">
                    <div className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-zinc-800">
                      {notif.sender?.avatar_url ? (
                        <img src={notif.sender.avatar_url} className="w-full h-full object-cover" alt="" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
                          {(notif.sender?.display_name?.[0] || notif.sender?.username?.[0] || '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 leading-snug">
                      <Link href={`/profile/${notif.sender?.username}`}
                        className="font-semibold text-white hover:text-violet-400 transition-colors">
                        {notif.sender?.display_name || notif.sender?.username}
                      </Link>
                      {' '}{config.label}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">{timeAgo}</p>
                  </div>

                  {notif.type === 'follow' && notif.sender?.id && (
                    <FollowBackButton targetId={notif.sender.id} />
                  )}

                  {notif.type !== 'follow' && (
                    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${config.bg}`}>
                      <Icon size={14} className={config.color} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}