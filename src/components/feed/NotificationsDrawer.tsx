'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Bell, Heart, MessageCircle, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale/it'

interface Notification {
  id: string
  type: string
  is_read: boolean
  created_at: string
  actor: {
    username: string
    display_name?: string
    avatar_url?: string
  } | null
  post_id?: string
}

function NotifIcon({ type }: { type: string }) {
  if (type === 'like') return <Heart size={14} className="text-red-400" fill="currentColor" />
  if (type === 'comment') return <MessageCircle size={14} className="text-blue-400" fill="currentColor" />
  if (type === 'follow') return <UserPlus size={14} className="text-violet-400" />
  return <Bell size={14} className="text-zinc-400" />
}

function notifLabel(type: string, actor: string) {
  if (type === 'like') return `${actor} ha messo like al tuo post`
  if (type === 'comment') return `${actor} ha commentato il tuo post`
  if (type === 'follow') return `${actor} ha iniziato a seguirti`
  return `${actor} ti ha inviato una notifica`
}

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const didLoad = useRef(false)

  useEffect(() => {
    if (!open || didLoad.current) return
    didLoad.current = true
    setLoading(true)
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase
        .from('notifications')
        .select('id, type, is_read, created_at, post_id, actor:actor_id(username, display_name, avatar_url)')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40)
        .then(({ data }) => {
          setNotifications((data as any[]) || [])
          setLoading(false)
          // Mark all as read
          supabase.from('notifications').update({ is_read: true }).eq('receiver_id', user.id).eq('is_read', false).then(() => {})
        })
    })
  }, [open])

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200]"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
        onClick={onClose}
      />

      {/* Panel — slides in from the left, positioned next to the sidebar */}
      <div
        className="fixed top-0 md:top-12 left-0 h-full md:h-[calc(100%-3rem)] z-[201] bg-zinc-950 border-r border-zinc-800 flex flex-col"
        style={{
          width: 360,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
          <h2 className="text-[16px] font-bold text-white">Notifiche</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col gap-3 p-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-zinc-800 rounded-full w-3/4" />
                    <div className="h-2.5 bg-zinc-800/60 rounded-full w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
                <Bell size={22} className="text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-500">Nessuna notifica</p>
            </div>
          )}

          {!loading && notifications.map(notif => {
            const actor = notif.actor
            const name = actor?.display_name || actor?.username || 'Qualcuno'
            const time = formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: it })
            return (
              <div
                key={notif.id}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-zinc-900 transition-colors border-b border-zinc-800/40 ${!notif.is_read ? 'bg-violet-600/5' : ''}`}
              >
                <div className="relative flex-shrink-0">
                  {actor ? (
                    <Link href={`/profile/${actor.username}`} onClick={onClose}>
                      <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-zinc-700">
                        <Avatar src={actor.avatar_url} username={actor.username} displayName={actor.display_name} size={40} />
                      </div>
                    </Link>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Bell size={18} className="text-zinc-500" />
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-zinc-900 flex items-center justify-center">
                    <NotifIcon type={notif.type} />
                  </span>
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-[13px] text-[var(--text-primary)] leading-snug">
                    {notifLabel(notif.type, name)}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{time}</p>
                </div>
                {!notif.is_read && (
                  <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0 mt-2" />
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-zinc-800">
          <Link
            href="/notifications"
            onClick={onClose}
            className="block w-full text-center text-[13px] font-semibold text-violet-400 hover:text-violet-300 transition-colors py-2"
          >
            Vedi tutte le notifiche
          </Link>
        </div>
      </div>
    </>
  )
}
