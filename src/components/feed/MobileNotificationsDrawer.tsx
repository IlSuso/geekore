'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { Bell, Heart, MessageCircle, UserPlus, Sparkles, PlugZap } from 'lucide-react'
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
  if (type === 'integration') return <PlugZap size={13} className="text-sky-300" />
  return <Bell size={13} className="text-[var(--accent)]" />
}

function notifLabel(type: string, actor: string) {
  if (type === 'like') return <><span className="font-black text-[var(--text-primary)]">{actor}</span> ha messo like al tuo post</>
  if (type === 'comment') return <><span className="font-black text-[var(--text-primary)]">{actor}</span> ha commentato il tuo post</>
  if (type === 'follow') return <><span className="font-black text-[var(--text-primary)]">{actor}</span> ha iniziato a seguirti</>
  if (type === 'integration') return <>La tua integrazione ha sincronizzato nuovi media</>
  return <>Geekore ha una nuova raccomandazione per te</>
}

function compactTime(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: it }).toUpperCase()
}

export function MobileNotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        setTimeout(() => onCloseRef.current(), 240)
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
      setTimeout(() => onCloseRef.current(), 240)
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
    setTimeout(() => onCloseRef.current(), 240)
  }, [])

  if (!open) return null

  const unread = notifications.filter(n => !n.is_read).length

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/65 backdrop-blur-sm"
      data-no-swipe="true"
      onClick={doClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Notifiche"
        className="flex h-[60dvh] max-h-[640px] min-h-[420px] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_-24px_80px_rgba(0,0,0,0.55)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: (show && !closing) ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'transform',
        }}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 flex-col gap-3 border-b border-[var(--border)] bg-[rgba(11,11,15,0.92)] px-4 pb-3 pt-3 backdrop-blur-2xl">
          <button
            type="button"
            onClick={doClose}
            className="mx-auto h-1.5 w-9 rounded-full bg-zinc-600/80"
            aria-label="Chiudi notifiche"
          />
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-[22px] font-black tracking-[-0.03em] text-[var(--text-primary)]">Notifiche</h1>
              <p className="gk-section-eyebrow">{unread} nuove</p>
            </div>
            <Link href="/notifications" onClick={doClose} className="gk-chip gk-chip-match">
              Apri pagina
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-3">
          {loading && (
            <div className="flex flex-col gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 animate-pulse">
                  <div className="h-9 w-9 flex-shrink-0 rounded-2xl bg-[var(--bg-secondary)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 rounded-full bg-[var(--bg-secondary)]" />
                    <div className="h-2.5 w-2/5 rounded-full bg-[var(--bg-secondary)]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="gk-empty-state mt-8">
              <Sparkles className="gk-empty-state-icon" />
              <p className="gk-empty-state-title">Nessuna notifica</p>
              <p className="gk-empty-state-subtitle">Quando qualcuno interagisce con te, lo vedrai qui.</p>
            </div>
          )}

          {!loading && notifications.length > 0 && (
            <div className="space-y-2">
              {notifications.map(notif => {
                const actor = notif.actor
                const name = actor?.display_name || actor?.username || 'Qualcuno'
                return (
                  <div
                    key={notif.id}
                    className={`flex items-center gap-3 rounded-[20px] border p-3 transition-colors active:bg-[var(--bg-card-hover)] ${
                      !notif.is_read
                        ? 'border-[rgba(230,255,61,0.20)] bg-[rgba(230,255,61,0.055)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${notif.is_read ? 'bg-transparent' : 'bg-[var(--accent)]'}`} />
                    <div className="relative flex-shrink-0">
                      {actor ? (
                        <Link href={`/profile/${actor.username}`} onClick={doClose}>
                          <div className="h-9 w-9 overflow-hidden rounded-xl ring-1 ring-white/10">
                            <Avatar src={actor.avatar_url} username={actor.username} displayName={actor.display_name} size={36} />
                          </div>
                        </Link>
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-secondary)]">
                          <Bell size={18} className="text-[var(--text-muted)]" />
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
                      <p className="mt-1 gk-mono text-[var(--text-muted)]">{compactTime(notif.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  )
}
