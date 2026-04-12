// DESTINAZIONE: src/app/notifications/page.tsx
// A6/M6: fix date-fns locale — import lazy invece di { it, enUS } non-lazy
// #7:  Skeleton loaders al posto dello spinner
// #10: Pull-to-refresh per aggiornare le notifiche su mobile
// #21: Badge PWA (già presente, mantenuto)

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Heart, UserPlus, MessageSquare, BellOff } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
// A6: import lazy — carica solo la locale necessaria
import type { Locale } from 'date-fns'
import { FollowBackButton } from '@/components/notifications/FollowBackButton'
import { Avatar } from '@/components/ui/Avatar'
import { SkeletonNotification } from '@/components/ui/SkeletonCard'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useLocale } from '@/lib/locale'

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

// A6: carica la locale date-fns in modo lazy
async function getDateLocale(locale: string): Promise<Locale> {
  if (locale === 'en') {
    const { enUS } = await import('date-fns/locale/en-US')
    return enUS
  }
  const { it } = await import('date-fns/locale/it')
  return it
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dateLocale, setDateLocale] = useState<Locale | null>(null)
  const supabase = createClient()
  const { locale } = useLocale()

  // A6: carica locale al mount e quando cambia
  useEffect(() => {
    getDateLocale(locale).then(setDateLocale)
  }, [locale])

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('notifications')
      .select(`
        id, type, created_at, is_read, post_id,
        sender:sender_id (username, display_name, avatar_url)
      `)
      .eq('receiver_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    const list = data || []
    setNotifications(list)
    setLoading(false)

    // PWA badge
    const unread = list.filter((n: any) => !n.is_read).length
    setAppBadge(unread)

    // Marca come lette
    if (list.some((n: any) => !n.is_read)) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)
      setAppBadge(0)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const { pullDistance, isRefreshing } = usePullToRefresh({ onRefresh: fetchNotifications })

  function timeAgo(dateStr: string) {
    if (!dateLocale) return ''
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: dateLocale })
  }

  function notifText(n: any) {
    const name = n.sender?.display_name || n.sender?.username || 'Qualcuno'
    if (n.type === 'like') return `${name} ha messo like al tuo post`
    if (n.type === 'comment') return `${name} ha commentato il tuo post`
    if (n.type === 'follow') return `${name} ha iniziato a seguirti`
    return `${name} ha interagito con te`
  }

  function NotifIcon({ type }: { type: string }) {
    if (type === 'like') return <Heart size={14} className="text-orange-400" />
    if (type === 'comment') return <MessageSquare size={14} className="text-violet-400" />
    if (type === 'follow') return <UserPlus size={14} className="text-emerald-400" />
    return null
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

      <div className="max-w-xl mx-auto px-4 pt-8 pb-24">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Notifiche</h1>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonNotification key={i} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-4">
              <BellOff size={24} className="text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-medium">Nessuna notifica</p>
            <p className="text-zinc-600 text-sm mt-1">Quando qualcuno interagisce con te, apparirà qui</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n: any) => (
              <div
                key={n.id}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
                  n.is_read ? 'bg-zinc-900/40 border-zinc-800' : 'bg-violet-950/20 border-violet-800/40'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-2xl overflow-hidden">
                    <Avatar
                      src={n.sender?.avatar_url}
                      username={n.sender?.username || 'user'}
                      displayName={n.sender?.display_name}
                      size={44}
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                    <NotifIcon type={n.type} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 leading-snug">{notifText(n)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{timeAgo(n.created_at)}</p>
                </div>

                {n.type === 'follow' && n.sender?.username && (
                  <FollowBackButton targetId={n.sender_id} />
                )}
                {n.post_id && (
                  <Link href={`/feed#${n.post_id}`} className="text-xs text-zinc-500 hover:text-violet-400 transition-colors flex-shrink-0">
                    Vedi →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}