'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Bell, Heart, MessageCircle, UserPlus, Sparkles } from 'lucide-react'
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
  if (type === 'comment') return <MessageCircle size={13} style={{ color: 'var(--accent)' }} fill="currentColor" />
  if (type === 'follow') return <UserPlus size={13} style={{ color: 'var(--accent)' }} />
  return <Bell size={13} className="text-[var(--text-muted)]" />
}

function notifLabel(type: string, actor: string) {
  if (type === 'like') return <><span className="font-black text-[var(--text-primary)]">{actor}</span> ha messo like al tuo post</>
  if (type === 'comment') return <><span className="font-black text-[var(--text-primary)]">{actor}</span> ha commentato il tuo post</>
  if (type === 'follow') return <><span className="font-black text-[var(--text-primary)]">{actor}</span> ha iniziato a seguirti</>
  return <><span className="font-black text-[var(--text-primary)]">{actor}</span> ti ha inviato una notifica</>
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

  useEffect(() => {
    if (!open) return
    setClosing(false)
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [open])

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
          }).catch(() => { })
        })
    })
  }, [open])

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

    history.pushState({ notifDrawer: true }, '', location.href)
    historyPushed.current = true
    const onPop = (e: PopStateEvent) => {
      if (backInitiatedByCode.current) { backInitiatedByCode.current = false; e.stopImmediatePropagation(); return }
      if (!historyPushed.current) return
      e.stopImmediatePropagation()
      historyPushed.current = false
      setShow(false)
      setClosing(true)
      setTimeout(() => onCloseRef.current(), 300)
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
      className="fixed inset-0 z-[200] flex flex-col bg-[var(--bg-primary)]"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        transform: (show && !closing) ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform',
      }}
    >
      <div className="flex h-[52px] flex-shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[rgba(11,11,15,0.92)] px-3 backdrop-blur-2xl">
        <button
          onClick={doClose}
          className="-ml-2 flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
          aria-label="Indietro"
        >
          <ChevronLeft size={27} strokeWidth={1.75} />
        </button>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] ring-1 ring-white/5">
            <Bell size={14} />
          </div>
          <h1 className="truncate text-[17px] font-black tracking-tight text-[var(--text-primary)]">Notifiche</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="flex flex-col gap-2 p-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 animate-pulse">
                <div className="h-11 w-11 flex-shrink-0 rounded-2xl bg-[var(--bg-secondary)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded-full bg-[var(--bg-secondary)]" />
                  <div className="h-2.5 w-2/5 rounded-full bg-[var(--bg-secondary)]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 px-8 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-card)]">
              <Sparkles size={26} className="text-[var(--text-muted)]" />
            </div>
            <p className="gk-headline text-[var(--text-primary)]">Nessuna notifica</p>
            <p className="gk-body max-w-xs">Quando qualcuno interagisce con te, lo vedrai qui.</p>
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <div className="space-y-2 p-3">
            {notifications.map(notif => {
              const actor = notif.actor
              const name = actor?.display_name || actor?.username || 'Qualcuno'
              const time = formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: it })
              return (
                <div
                  key={notif.id}
                  className={`flex items-center gap-3 rounded-[20px] border p-3 transition-colors active:bg-[var(--bg-card-hover)] ${
                    !notif.is_read
                      ? 'border-[rgba(230,255,61,0.20)] bg-[rgba(230,255,61,0.055)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {actor ? (
                      <Link href={`/profile/${actor.username}`} onClick={doClose}>
                        <div className="h-11 w-11 overflow-hidden rounded-2xl ring-1 ring-white/10">
                          <Avatar src={actor.avatar_url} username={actor.username} displayName={actor.display_name} size={44} />
                        </div>
                      </Link>
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
                        <Bell size={20} className="text-[var(--text-muted)]" />
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-primary)]">
                      <NotifIcon type={notif.type} />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug text-[var(--text-secondary)]">
                      {notifLabel(notif.type, name)}
                    </p>
                    <p className="gk-mono mt-1 text-[var(--text-muted)]">{time}</p>
                  </div>

                  {!notif.is_read && <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: 'var(--accent)' }} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
