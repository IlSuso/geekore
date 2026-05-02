// src/app/notifications/page.tsx

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Heart, UserPlus, MessageCircle, Star, PlugZap, Bell } from 'lucide-react'
import Link from 'next/link'
import { FollowBackButton } from '@/components/notifications/FollowBackButton'
import { Avatar } from '@/components/ui/Avatar'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PageScaffold } from '@/components/ui/PageScaffold'

type NotificationFilter = 'all' | 'social' | 'system' | 'integration'

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'Tutto' },
  { id: 'social', label: 'Social' },
  { id: 'system', label: 'Sistema' },
  { id: 'integration', label: 'Integrazioni' },
]

function notificationBucket(type: string): NotificationFilter {
  if (type === 'like' || type === 'comment' || type === 'follow') return 'social'
  if (type === 'integration' || type === 'steam' || type === 'letterboxd' || type === 'anilist' || type === 'bgg') return 'integration'
  return 'system'
}

function setAppBadge(count: number) {
  if (typeof navigator === 'undefined') return
  if ('setAppBadge' in navigator) {
    if (count > 0) { (navigator as any).setAppBadge(count).catch(() => {}) }
    else { (navigator as any).clearAppBadge().catch(() => {}) }
  }
}

function compactTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ORA'
  if (m < 60) return `${m}M`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}H`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}G`
  return `${Math.floor(d / 7)}SETT`
}

function NotificationCompactStats({ total, unread }: { total: number; unread: number }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-3">
      <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
        <p className="font-mono-data text-[20px] font-black leading-none text-[var(--accent)]">{total}</p>
        <p className="gk-label mt-1">totali</p>
      </div>
      <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
        <p className="font-mono-data text-[20px] font-black leading-none text-[var(--text-primary)]">{unread}</p>
        <p className="gk-label mt-1">non lette</p>
      </div>
      <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
        <p className="font-mono-data text-[20px] font-black leading-none text-[var(--text-primary)]">24h</p>
        <p className="gk-label mt-1">merge</p>
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all')
  const supabase = createClient()

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('notifications')
      .select(`id, type, created_at, is_read, post_id, sender_id, sender:sender_id (username, display_name, avatar_url)`)
      .eq('receiver_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    const list = data || []
    const followSenderIds = [...new Set(
      list.filter((n: any) => n.type === 'follow' && n.sender_id).map((n: any) => n.sender_id)
    )]
    let followingSet = new Set<string>()
    if (followSenderIds.length > 0) {
      const { data: followData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', followSenderIds)
      followingSet = new Set((followData || []).map((f: any) => f.following_id))
    }

    const listWithFollow = list.map((n: any) => ({
      ...n,
      _isFollowing: n.type === 'follow' && n.sender_id ? followingSet.has(n.sender_id) : undefined,
    }))

    setNotifications(listWithFollow)
    setLoading(false)
    setAppBadge(list.filter((n: any) => !n.is_read).length)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (notifications.length === 0) return
    const unreadIds = notifications.filter((n: any) => !n.is_read).map((n: any) => n.id)
    if (unreadIds.length === 0) return

    const seenIds = new Set<string>()
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = async () => {
      if (seenIds.size === 0) return
      const toMark = [...seenIds]
      seenIds.clear()
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: toMark }),
      })
      setNotifications(prev => prev.map(n => toMark.includes(n.id) ? { ...n, is_read: true } : n))
      setAppBadge(0)
    }

    const observer = new IntersectionObserver((entries) => {
      entries
        .filter(e => e.isIntersecting && e.intersectionRatio >= 0.6)
        .forEach(e => {
          const id = e.target.getAttribute('data-notif-id')
          if (id && unreadIds.includes(id)) seenIds.add(id)
        })
      if (seenIds.size > 0) {
        if (flushTimer) clearTimeout(flushTimer)
        flushTimer = setTimeout(flush, 600)
      }
    }, { threshold: [0.6] })

    document.querySelectorAll('[data-notif-id]').forEach(el => observer.observe(el))
    return () => {
      observer.disconnect()
      if (flushTimer) clearTimeout(flushTimer)
    }
  }, [notifications])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const { distance: pullDistance, refreshing: isRefreshing } = usePullToRefresh({ onRefresh: fetchNotifications })

  function notifText(type: string): string {
    if (type === 'like') return 'ha messo like al tuo post.'
    if (type === 'comment') return 'ha commentato il tuo post.'
    if (type === 'follow') return 'ha iniziato a seguirti.'
    if (type === 'rating') return 'ha votato un media.'
    if (notificationBucket(type) === 'integration') return 'ha sincronizzato una nuova integrazione.'
    return 'ha una nuova raccomandazione per te.'
  }

  function NotifIcon({ type }: { type: string }) {
    const base = 'absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-black'
    if (type === 'like') return <span className={`${base} bg-red-500`}><Heart size={10} fill="white" color="white" /></span>
    if (type === 'follow') return <span className={base} style={{ background: 'var(--accent)' }}><UserPlus size={10} color="#0B0B0F" /></span>
    if (type === 'comment') return <span className={base} style={{ background: 'var(--accent)' }}><MessageCircle size={10} color="#0B0B0F" /></span>
    if (type === 'rating') return <span className={`${base} bg-yellow-500`}><Star size={10} fill="white" color="white" /></span>
    if (notificationBucket(type) === 'integration') return <span className={`${base} bg-sky-500`}><PlugZap size={10} color="white" /></span>
    return <span className={base} style={{ background: 'var(--accent)' }}><Bell size={10} color="#0B0B0F" /></span>
  }

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  function getGroup(dateStr: string): string {
    const d = new Date(dateStr)
    if (d.toDateString() === today.toDateString()) return 'Oggi'
    if (d.toDateString() === yesterday.toDateString()) return 'Ieri'
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)
    if (d > weekAgo) return 'Questa settimana'
    return 'Precedenti'
  }

  function aggregateNotifications(list: any[]): any[] {
    const WINDOW_MS = 24 * 60 * 60 * 1000
    const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const groups: Map<string, any[]> = new Map()
    for (const n of sorted) {
      const context = n.post_id ?? 'none'
      const ts = new Date(n.created_at).getTime()
      let placed = false
      for (const [key, group] of groups) {
        const [gType, gContext] = key.split('|')
        if (gType !== n.type || gContext !== context) continue
        const newestInGroup = new Date(group[0].created_at).getTime()
        if (newestInGroup - ts <= WINDOW_MS) {
          group.push(n)
          placed = true
          break
        }
      }
      if (!placed) groups.set(`${n.type}|${context}|${ts}`, [n])
    }

    const result: any[] = []
    for (const [, group] of groups) {
      if (group.length < 3) result.push(...group)
      else {
        const first = group[0]
        const second = group[1]
        result.push({
          ...first,
          _aggregated: true,
          _senders: group.map((n: any) => n.sender),
          _firstSender: first.sender,
          _secondSender: second.sender,
          _othersCount: group.length - 2,
          is_read: group.every((n: any) => n.is_read),
        })
      }
    }
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  const visibleNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications
    return notifications.filter(n => notificationBucket(n.type) === activeFilter)
  }, [notifications, activeFilter])

  const grouped = aggregateNotifications(visibleNotifications).reduce((acc: Record<string, any[]>, n: any) => {
    const g = getGroup(n.created_at)
    if (!acc[g]) acc[g] = []
    acc[g].push(n)
    return acc
  }, {})

  const groupOrder = ['Oggi', 'Ieri', 'Questa settimana', 'Precedenti']
  const unread = notifications.filter((n: any) => !n.is_read).length

  return (
    <PageScaffold
      title="Notifiche"
      description="Like, commenti, follow e segnali social dalla community."
      icon={<Sparkles size={16} />}
      className="gk-notifications-page"
      contentClassName="gk-page-density max-w-screen-lg pt-2 md:pt-8 pb-28"
    >
      <PullToRefreshIndicator distance={pullDistance} refreshing={isRefreshing} />
      <NotificationCompactStats total={notifications.length} unread={unread} />

      <div className="mb-5 grid grid-cols-4 gap-1 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 p-2 ring-1 ring-white/5" data-no-swipe="true">
        {FILTERS.map(filter => {
          const active = activeFilter === filter.id
          const count = filter.id === 'all'
            ? notifications.length
            : notifications.filter(n => notificationBucket(n.type) === filter.id).length
          return (
            <button
              key={filter.id}
              type="button"
              data-no-swipe="true"
              onClick={() => setActiveFilter(filter.id)}
              className="min-h-11 rounded-xl px-1 py-2 text-[11px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 sm:text-[12px]"
              style={active ? { background: 'rgba(230,255,61,0.09)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
              aria-pressed={active}
            >
              <span className="block">{filter.label}</span>
              <span className="font-mono-data text-[9px] opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 animate-pulse">
              <div className="h-11 w-11 skeleton rounded-2xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 skeleton rounded-full w-3/4" />
                <div className="h-2.5 skeleton rounded-full w-1/3" />
              </div>
              <div className="h-8 w-16 skeleton rounded-2xl flex-shrink-0" />
            </div>
          ))}
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <BellOff size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessuna notifica</p>
          <p className="gk-body mx-auto max-w-sm">Quando ci saranno notifiche in questa categoria, appariranno qui.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupOrder.filter(g => grouped[g]?.length).map(group => (
            <div key={group}>
              <p className="gk-label mb-2 px-1">{group}</p>
              <div className="space-y-2">
                {grouped[group].map((n: any) => {
                  const username = n.sender?.username
                  const name = n.sender?.display_name || username || 'Qualcuno'

                  function aggregatedText(n: any): React.ReactNode {
                    const first = n._firstSender?.display_name || n._firstSender?.username || 'Qualcuno'
                    const second = n._secondSender?.display_name || n._secondSender?.username
                    const others = n._othersCount
                    const action = notifText(n.type)
                    return (
                      <>
                        <Link href={`/profile/${n._firstSender?.username}`} className="font-black transition-opacity hover:opacity-70">{first}</Link>
                        {second && <>, <Link href={`/profile/${n._secondSender?.username}`} className="font-black transition-opacity hover:opacity-70">{second}</Link></>}
                        {others > 0 && <> e altre <span className="font-black">{others}</span> persone</>}
                        {' '}{action}
                      </>
                    )
                  }

                  return (
                    <div
                      key={n.id}
                      data-notif-id={n.id}
                      className={`flex items-center gap-3 rounded-[20px] border p-3 transition-colors hover:bg-[var(--bg-card-hover)] ${
                        !n.is_read
                          ? 'border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.045)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-[var(--accent)]'}`} />
                      <div className="relative flex-shrink-0">
                        {n._aggregated ? (
                          <div className="relative h-11 w-11">
                            <div className="absolute left-0 top-0 h-8 w-8 overflow-hidden rounded-2xl ring-2 ring-[var(--bg-primary)]">
                              <Avatar src={n._senders[1]?.avatar_url} username={n._senders[1]?.username || 'user'} displayName={n._senders[1]?.display_name} size={32} />
                            </div>
                            <div className="absolute bottom-0 right-0 h-8 w-8 overflow-hidden rounded-2xl ring-2 ring-[var(--bg-primary)]">
                              <Avatar src={n._senders[0]?.avatar_url} username={n._senders[0]?.username || 'user'} displayName={n._senders[0]?.display_name} size={32} />
                            </div>
                          </div>
                        ) : n.sender ? (
                          <div className="h-11 w-11 overflow-hidden rounded-2xl ring-1 ring-white/10">
                            <Avatar src={n.sender?.avatar_url} username={n.sender?.username || 'user'} displayName={n.sender?.display_name} size={44} />
                          </div>
                        ) : (
                          <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                            {notificationBucket(n.type) === 'integration' ? <PlugZap size={18} className="text-sky-300" /> : <Bell size={18} className="text-[var(--accent)]" />}
                          </div>
                        )}
                        <NotifIcon type={n.type} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-snug text-[var(--text-secondary)]">
                          {n._aggregated ? aggregatedText(n) : (
                            <>
                              {username ? (
                                <Link href={`/profile/${username}`} className="font-black text-[var(--text-primary)] transition-opacity hover:opacity-70">{name}</Link>
                              ) : n.sender ? (
                                <span className="font-black text-[var(--text-primary)]">{name}</span>
                              ) : null}{' '}
                              <span>{notifText(n.type)}</span>
                            </>
                          )}
                        </p>
                        <p className="mt-1 font-mono-data text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{compactTimeAgo(n.created_at)}</p>
                      </div>

                      <div className="flex-shrink-0">
                        {!n._aggregated && n.type === 'follow' && n.sender_id ? (
                          <FollowBackButton targetId={n.sender_id} isFollowingInitial={n._isFollowing} />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageScaffold>
  )
}
