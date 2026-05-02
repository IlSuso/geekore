'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Bell, Heart, MessageCircle, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale/it'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'

interface Notification {
  id: string
  type: string
  is_read: boolean
  created_at: string
  actor: { username: string; display_name?: string; avatar_url?: string } | null
  post_id?: string
}

function NotifIcon({ type }: { type: string }) {
  if (type === 'like') return <Heart size={13} className="text-red-400" fill="currentColor" />
  if (type === 'comment') return <MessageCircle size={13} className="text-blue-400" fill="currentColor" />
  if (type === 'follow') return <UserPlus size={13} style={{ color: '#E6FF3D' }} />
  return <Bell size={13} className="text-zinc-400" />
}

function notifLabel(type: string, actor: string) {
  if (type === 'like') return <><span className="font-semibold text-white">{actor}</span> ha messo like al tuo post</>
  if (type === 'comment') return <><span className="font-semibold text-white">{actor}</span> ha commentato il tuo post</>
  if (type === 'follow') return <><span className="font-semibold text-white">{actor}</span> ha iniziato a seguirti</>
  return <><span className="font-semibold text-white">{actor}</span> ti ha inviato una notifica</>
}

export function MobileNotificationsDrawer({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [closing, setClosing] = useState(false)
  const [show, setShow] = useState(false)

  const historyPushed = useRef(false)
  const backInitiatedByCode = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const didLoad = useRef(false)

  // Enter animation — one rAF after mount so the CSS transition fires
  useEffect(() => {
    if (!open) return
    setClosing(false)
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  // Load notifications once per open
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
        .limit(50)
        .then(({ data }) => {
          setNotifications((data as unknown as Notification[]) || [])
          setLoading(false)
          fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true }),
          }).catch(() => {})
        })
    })
  }, [open])

  // Back gesture — Android usa androidBack (niente pushState), iOS usa pushState
  useEffect(() => {
    if (!open) { gestureState.drawerActive = false; return }
    gestureState.drawerActive = true
    const isAndroid = /android/i.test(navigator.userAgent)

    if (isAndroid) {
      const closeDrawer = () => {
        setShow(false)
        setClosing(true)
        setTimeout(() => onCloseRef.current(), 300)
      }
      androidBack.push(closeDrawer)
      return () => {
        gestureState.drawerActive = false
        androidBack.pop(closeDrawer)
      }
    }

    // iOS
    history.pushState({ notifDrawer: true }, '', location.href)
    historyPushed.current = true
    const onPop = (e: PopStateEvent) => {
      if (backInitiatedByCode.current) { backInitiatedByCode.current = false; e.stopImmediatePropagation(); return }
      if (!historyPushed.current) return
      e.stopImmediatePropagation()
      history.pushState({ notifDrawer: true }, '', location.href)
    }
    window.addEventListener('popstate', onPop, { capture: true })
    return () => {
      window.removeEventListener('popstate', onPop, { capture: true })
      gestureState.drawerActive = false
    }
  }, [open])

  const doClose = useCallback(() => {
    setShow(false)
    setClosing(true)
    const isAndroid = /android/i.test(navigator.userAgent)
    if (!isAndroid && historyPushed.current) {
      historyPushed.current = false
      backInitiatedByCode.current = true
      history.back()
    }
    setTimeout(() => onCloseRef.current(), 300)
  }, [])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-[var(--bg-primary)] flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transform: (show && !closing) ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform',
      }}
    >
      {/* Header — stessa altezza e stile di MobileHeader */}
      <div className="flex items-center gap-1 px-3 h-[52px] border-b border-[var(--border)] flex-shrink-0">
        <button
          onClick={doClose}
          className="w-10 h-10 -ml-2 flex items-center justify-center text-[var(--text-primary)]"
          aria-label="Indietro"
        >
          <ChevronLeft size={28} strokeWidth={1.6} />
        </button>
        <h1 className="text-[17px] font-semibold text-[var(--text-primary)]">Notifiche</h1>
      </div>

      {/* Lista notifiche */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="flex flex-col gap-1 pt-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-zinc-800 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-zinc-800 rounded-full w-3/4" />
                  <div className="h-2.5 bg-zinc-800/50 rounded-full w-2/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 px-8 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-800/80 flex items-center justify-center">
              <Bell size={26} className="text-zinc-500" />
            </div>
            <p className="text-sm font-medium text-zinc-400">Nessuna notifica</p>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Quando qualcuno interagisce con te, lo vedrai qui.
            </p>
          </div>
        )}

        {!loading && notifications.map(notif => {
          const actor = notif.actor
          const name = actor?.display_name || actor?.username || 'Qualcuno'
          const time = formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: it })
          return (
            <div
              key={notif.id}
              className={`flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800/40 transition-colors active:bg-zinc-900/60 ${
                !notif.is_read ? 'bg-zinc-800/40' : ''
              }`}
            >
              <div className="relative flex-shrink-0">
                {actor ? (
                  <Link href={`/profile/${actor.username}`} onClick={doClose}>
                    <div className="w-11 h-11 rounded-full overflow-hidden ring-1 ring-zinc-700/60">
                      <Avatar
                        src={actor.avatar_url}
                        username={actor.username}
                        displayName={actor.display_name}
                        size={44}
                      />
                    </div>
                  </Link>
                ) : (
                  <div className="w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Bell size={20} className="text-zinc-500" />
                  </div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                  <NotifIcon type={notif.type} />
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] text-zinc-300 leading-snug">
                  {notifLabel(notif.type, name)}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{time}</p>
              </div>

              {!notif.is_read && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#E6FF3D' }} />
              )}
            </div>
          )
        })}
      </div>
    </div>,
    document.body
  )
}
