// src/app/notifications/page.tsx

'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Flame, UserPlus, MessageCircle, Star, PlugZap, Bell, BellOff } from 'lucide-react'
import Link from 'next/link'
import { FollowBackButton } from '@/components/notifications/FollowBackButton'
import { Avatar } from '@/components/ui/Avatar'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PageScaffold } from '@/components/ui/PageScaffold'
import { useLocale } from '@/lib/locale'

type NotificationFilter = 'all' | 'social' | 'system' | 'integration'

const NOTIFICATIONS_COPY = {
  it: {
    title: 'Notifiche',
    description: 'Segnali social e update dalla community.',
    filters: { all: 'Tutto', social: 'Social', system: 'Sistema', integration: 'Integrazioni' },
    now: 'ORA', minutes: 'M', hours: 'H', days: 'G', weeks: 'SETT',
    like: 'ha acceso il tuo post.',
    comment: 'ha commentato il tuo post.',
    follow: 'ha iniziato a seguirti.',
    rating: 'ha votato un media.',
    integration: 'ha sincronizzato una nuova integrazione.',
    fallback: 'ha una nuova raccomandazione per te.',
    today: 'Oggi', yesterday: 'Ieri', week: 'Questa settimana', previous: 'Precedenti',
    unread: (n: number) => `${n} da leggere`,
    allRead: 'Tutto letto',
    total: (n: number) => `${n} totali`,
    emptyTitle: 'Nessuna notifica',
    emptyBody: 'Quando arriveranno like, commenti, follow o update dalle integrazioni li troverai qui.',
    findFriends: 'Trova amici',
    someone: 'Qualcuno',
    otherPeople: (n: number) => `e altre ${n} persone`,
  },
  en: {
    title: 'Notifications',
    description: 'Social signals and community updates.',
    filters: { all: 'All', social: 'Social', system: 'System', integration: 'Integrations' },
    now: 'NOW', minutes: 'M', hours: 'H', days: 'D', weeks: 'W',
    like: 'lit up your post.',
    comment: 'commented on your post.',
    follow: 'started following you.',
    rating: 'rated a media item.',
    integration: 'synced a new integration.',
    fallback: 'has a new recommendation for you.',
    today: 'Today', yesterday: 'Yesterday', week: 'This week', previous: 'Earlier',
    unread: (n: number) => `${n} unread`,
    allRead: 'All read',
    total: (n: number) => `${n} total`,
    emptyTitle: 'No notifications',
    emptyBody: 'Likes, comments, follows and integration updates will show up here.',
    findFriends: 'Find friends',
    someone: 'Someone',
    otherPeople: (n: number) => `and ${n} other people`,
  },
} as const

type NotificationsCopy = (typeof NOTIFICATIONS_COPY)['it'] | (typeof NOTIFICATIONS_COPY)['en']

function filters(copy: NotificationsCopy): Array<{ id: NotificationFilter; label: string }> {
  return [
    { id: 'all', label: copy.filters.all },
    { id: 'social', label: copy.filters.social },
    { id: 'system', label: copy.filters.system },
    { id: 'integration', label: copy.filters.integration },
  ]
}

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

function compactTimeAgo(dateStr: string, copy: NotificationsCopy): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return copy.now
  if (m < 60) return `${m}${copy.minutes}`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}${copy.hours}`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}${copy.days}`
  return `${Math.floor(d / 7)}${copy.weeks}`
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all')
  const supabase = createClient()
  const { locale } = useLocale()
  const nc = NOTIFICATIONS_COPY[locale] || NOTIFICATIONS_COPY.it
  const FILTERS = filters(nc)

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
      entries.filter(e => e.isIntersecting && e.intersectionRatio >= 0.6).forEach(e => {
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
    if (type === 'like') return nc.like
    if (type === 'comment') return nc.comment
    if (type === 'follow') return nc.follow
    if (type === 'rating') return nc.rating
    if (notificationBucket(type) === 'integration') return nc.integration
    return nc.fallback
  }

  function NotifIcon({ type }: { type: string }) {
    const base = 'absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] border-black'
    if (type === 'like') return <span className={`${base} bg-orange-500`}><Flame size={10} fill="white" color="white" /></span>
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
    if (d.toDateString() === today.toDateString()) return nc.today
    if (d.toDateString() === yesterday.toDateString()) return nc.yesterday
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7)
    if (d > weekAgo) return nc.week
    return nc.previous
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
        result.push({ ...first, _aggregated: true, _senders: group.map((n: any) => n.sender), _firstSender: first.sender, _secondSender: second.sender, _othersCount: group.length - 2, is_read: group.every((n: any) => n.is_read) })
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

  const groupOrder = [nc.today, nc.yesterday, nc.week, nc.previous]
  const unread = notifications.filter((n: any) => !n.is_read).length

  return (
    <PageScaffold
      title={nc.title}
      description={nc.description}
      icon={<Bell size={16} />}
      className="gk-notifications-page"
      contentClassName="gk-page-density mx-auto max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      <PullToRefreshIndicator distance={pullDistance} refreshing={isRefreshing} />

      <div className="mb-5 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/72 p-3 ring-1 ring-white/5 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.08)] text-[var(--accent)]">
              <Bell size={18} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-[28px] font-black leading-none tracking-[-0.04em] text-[var(--text-primary)] md:text-[32px]">{nc.title}</h1>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{unread > 0 ? nc.unread(unread) : nc.allRead} · {nc.total(notifications.length)}</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:pb-0" data-no-swipe="true">
            {FILTERS.map(filter => {
              const active = activeFilter === filter.id
              const count = filter.id === 'all' ? notifications.length : notifications.filter(n => notificationBucket(n.type) === filter.id).length
              return (
                <button
                  key={filter.id}
                  type="button"
                  data-no-swipe="true"
                  onClick={() => setActiveFilter(filter.id)}
                  className={`inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-2xl border px-3 text-[13px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${active ? 'border-[rgba(230,255,61,0.42)] bg-[rgba(230,255,61,0.12)] text-[var(--accent)]' : 'border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-white'}`}
                  aria-pressed={active}
                >
                  <span>{filter.label}</span>
                  <span className={`font-mono-data text-[10px] ${active ? 'text-[var(--accent)]/75' : 'text-[var(--text-muted)]'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 animate-pulse">
              <div className="h-11 w-11 skeleton rounded-2xl flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 skeleton rounded-full w-3/4" />
                <div className="h-2.5 skeleton rounded-full w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <BellOff size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">{nc.emptyTitle}</p>
          <p className="gk-body mx-auto mb-6 max-w-sm">{nc.emptyBody}</p>
          <Link href="/friends" data-no-swipe="true" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
            {nc.findFriends}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {groupOrder.filter(g => grouped[g]?.length).map(group => (
            <section key={group}>
              <p className="gk-label mb-2 px-1">{group}</p>
              <div className="space-y-2">
                {grouped[group].map((n: any) => {
                  const username = n.sender?.username
                  const name = n.sender?.display_name || username || nc.someone
                  function aggregatedText(n: any): React.ReactNode {
                    const first = n._firstSender?.display_name || n._firstSender?.username || nc.someone
                    const second = n._secondSender?.display_name || n._secondSender?.username
                    const others = n._othersCount
                    const action = notifText(n.type)
                    return <><Link href={`/profile/${n._firstSender?.username}`} className="font-black transition-opacity hover:opacity-70">{first}</Link>{second && <>, <Link href={`/profile/${n._secondSender?.username}`} className="font-black transition-opacity hover:opacity-70">{second}</Link></>}{others > 0 && <> {nc.otherPeople(others)}</>} {' '}{action}</>
                  }
                  return (
                    <div
                      key={n.id}
                      data-notif-id={n.id}
                      className={`flex items-center gap-3 rounded-[22px] border p-3 transition-colors hover:bg-[var(--bg-card-hover)] ${!n.is_read ? 'border-[rgba(230,255,61,0.24)] bg-[rgba(230,255,61,0.045)]' : 'border-[var(--border-subtle)] bg-[var(--bg-card)]'}`}
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
                          {n._aggregated ? aggregatedText(n) : <>{username ? <Link href={`/profile/${username}`} className="font-black text-[var(--text-primary)] transition-opacity hover:opacity-70">{name}</Link> : n.sender ? <span className="font-black text-[var(--text-primary)]">{name}</span> : null}{' '}<span>{notifText(n.type)}</span></>}
                        </p>
                        <p className="mt-1 font-mono-data text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{compactTimeAgo(n.created_at, nc)}</p>
                      </div>
                      <div className="flex-shrink-0">{!n._aggregated && n.type === 'follow' && n.sender_id ? <FollowBackButton targetId={n.sender_id} isFollowingInitial={n._isFollowing} /> : null}</div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageScaffold>
  )
}
