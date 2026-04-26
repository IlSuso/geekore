// src/app/notifications/page.tsx
// Instagram-style notifications: full-bleed rows, no card borders, avatar + action icon

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Heart, UserPlus, MessageCircle, BellOff, Star } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { Locale } from 'date-fns'
import { FollowBackButton } from '@/components/notifications/FollowBackButton'
import { Avatar } from '@/components/ui/Avatar'
import { SkeletonNotification } from '@/components/ui/SkeletonCard'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { PullWrapper } from '@/components/ui/PullWrapper'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { useLocale } from '@/lib/locale'

function setAppBadge(count: number) {
  if (typeof navigator === 'undefined') return
  if ('setAppBadge' in navigator) {
    if (count > 0) { (navigator as any).setAppBadge(count).catch(() => {}) }
    else { (navigator as any).clearAppBadge().catch(() => {}) }
  }
}

async function getDateLocale(locale: string): Promise<Locale> {
  if (locale === 'en') {
    const { enUS } = await import('date-fns/locale/en-US')
    return enUS
  }
  const { it } = await import('date-fns/locale/it')
  return it
}

// Compact timeago: "2h" "3g" "4sett" — Instagram style
function compactTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}g`
  return `${Math.floor(d / 7)}sett`
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { locale } = useLocale()

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

    // Batch-load follow status per tutti i sender di notifiche follow
    // Evita N query separate nel FollowBackButton
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

    const unread = list.filter((n: any) => !n.is_read).length
    setAppBadge(unread)
  }, [])

  // Fix #19 Repair Bible: mark-as-read solo per notifiche effettivamente viste
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
      const supabase = (await import('@/lib/supabase/client')).createClient()
      await supabase.from('notifications').update({ is_read: true }).in('id', toMark)
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

    const els = document.querySelectorAll('[data-notif-id]')
    els.forEach(el => observer.observe(el))

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
    return 'ha interagito con te.'
  }

  function NotifIcon({ type }: { type: string }) {
    const base = "absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-[1.5px] border-black"
    if (type === 'like') return (
      <span className={`${base} bg-red-500`}><Heart size={10} fill="white" color="white" /></span>
    )
    if (type === 'follow') return (
      <span className={`${base} bg-violet-600`}><UserPlus size={10} color="white" /></span>
    )
    if (type === 'comment') return (
      <span className={`${base}`} style={{ background: '#8b5cf6' }}><MessageCircle size={10} color="white" /></span>
    )
    if (type === 'rating') return (
      <span className={`${base} bg-yellow-500`}><Star size={10} fill="white" color="white" /></span>
    )
    return null
  }

  // Group by date — Instagram-style
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

  // Aggregazione notifiche — stesso tipo + stesso contesto (post_id o null)
  // Soglia: 3+ notifiche dello stesso gruppo → riga aggregata
  function aggregateNotifications(list: any[]): any[] {
    // Finestra di aggregazione: 24 ore
    // Notifiche dello stesso tipo + stesso contesto arrivate nella stessa finestra di 24h si aggregano
    const WINDOW_MS = 24 * 60 * 60 * 1000

    // Ordina per data decrescente prima di raggruppare
    const sorted = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const groups: Map<string, any[]> = new Map()
    for (const n of sorted) {
      const context = n.post_id ?? 'none'
      const ts = new Date(n.created_at).getTime()
      // Cerca un gruppo esistente compatibile:
      // stesso type + stesso context + dentro la finestra di 24h dalla notifica più recente del gruppo
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
      if (!placed) {
        // Crea un nuovo gruppo — chiave unica con timestamp della prima notifica
        const key = `${n.type}|${context}|${ts}`
        groups.set(key, [n])
      }
    }

    const result: any[] = []
    for (const [, group] of groups) {
      if (group.length < 3) {
        // Meno di 3 → mostra singole
        result.push(...group)
      } else {
        // 3+ → aggrega con la più recente come base
        const first = group[0]
        const second = group[1]
        const othersCount = group.length - 2
        result.push({
          ...first,
          _aggregated: true,
          _senders: group.map((n: any) => n.sender),
          _firstSender: first.sender,
          _secondSender: second.sender,
          _othersCount: othersCount,
          is_read: group.every((n: any) => n.is_read),
        })
      }
    }

    // Riordina per data decrescente
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  const grouped = aggregateNotifications(notifications).reduce((acc: any, n: any) => {
    const g = getGroup(n.created_at)
    if (!acc[g]) acc[g] = []
    acc[g].push(n)
    return acc
  }, {} as Record<string, any[]>)

  const groupOrder = ['Oggi', 'Ieri', 'Questa settimana', 'Precedenti']

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isRefreshing} />

      <div className="max-w-3xl mx-auto pb-24">

        {loading ? (
          <div className="px-4 pt-4 space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3 px-4 animate-pulse">
                <div className="w-11 h-11 skeleton rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 skeleton rounded-full w-3/4" />
                  <div className="h-2.5 skeleton rounded-full w-1/3" />
                </div>
                <div className="w-10 h-10 skeleton rounded-lg flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-8">
            {/* Instagram-style empty state */}
            <div className="w-16 h-16 rounded-full border-[2px] border-[var(--border)] flex items-center justify-center mb-4">
              <BellOff size={28} className="text-[var(--text-muted)]" />
            </div>
            <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">Nessuna notifica</p>
            <p className="text-[14px] text-[var(--text-secondary)]">Quando qualcuno interagisce con te, le notifiche appariranno qui.</p>
          </div>
        ) : (
          <>
            {groupOrder.filter(g => grouped[g]?.length).map(group => (
              <div key={group}>
                {/* Section header — Instagram style */}
                <p className="px-4 pt-5 pb-2 text-[15px] font-semibold text-[var(--text-primary)]">
                  {group}
                </p>

                {grouped[group].map((n: any) => {
                  const username = n.sender?.username
                  const name = n.sender?.display_name || username || 'Qualcuno'

                  // Testo aggregato
                  function aggregatedText(n: any): React.ReactNode {
                    const first = n._firstSender?.display_name || n._firstSender?.username || 'Qualcuno'
                    const second = n._secondSender?.display_name || n._secondSender?.username
                    const others = n._othersCount
                    const action = notifText(n.type)
                    return (
                      <>
                        <Link href={`/profile/${n._firstSender?.username}`} className="font-semibold hover:opacity-70 transition-opacity">{first}</Link>
                        {second && <>, <Link href={`/profile/${n._secondSender?.username}`} className="font-semibold hover:opacity-70 transition-opacity">{second}</Link></>}
                        {others > 0 && <> e altre <span className="font-semibold">{others}</span> persone</>}
                        {' '}{action}
                      </>
                    )
                  }

                  return (
                    <div
                      key={n.id}
                      data-notif-id={n.id}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--bg-hover)] ${!n.is_read ? 'bg-blue-500/5' : ''}`}
                    >
                      {/* Avatar with action badge — aggregato mostra stack di avatar */}
                      <div className="relative flex-shrink-0">
                        {n._aggregated ? (
                          <div className="relative w-11 h-11">
                            <div className="absolute top-0 left-0 w-8 h-8 rounded-full overflow-hidden ring-2 ring-[var(--bg-primary)]">
                              <Avatar src={n._senders[1]?.avatar_url} username={n._senders[1]?.username || 'user'} displayName={n._senders[1]?.display_name} size={32} />
                            </div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full overflow-hidden ring-2 ring-[var(--bg-primary)]">
                              <Avatar src={n._senders[0]?.avatar_url} username={n._senders[0]?.username || 'user'} displayName={n._senders[0]?.display_name} size={32} />
                            </div>
                          </div>
                        ) : (
                          <div className="w-11 h-11 rounded-full overflow-hidden">
                            <Avatar src={n.sender?.avatar_url} username={n.sender?.username || 'user'} displayName={n.sender?.display_name} size={44} />
                          </div>
                        )}
                        <NotifIcon type={n.type} />
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-[var(--text-primary)] leading-snug">
                          {n._aggregated ? aggregatedText(n) : (
                            <>
                              {username ? (
                                <Link href={`/profile/${username}`} className="font-semibold hover:opacity-70 transition-opacity">{name}</Link>
                              ) : (
                                <span className="font-semibold">{name}</span>
                              )}{' '}
                              <span className="text-[var(--text-primary)]">{notifText(n.type)}</span>
                            </>
                          )}
                          {' '}
                          <span className="text-[var(--text-muted)]">{compactTimeAgo(n.created_at)}</span>
                        </p>
                      </div>

                      {/* Right side: follow back button (solo notifiche singole) */}
                      <div className="flex-shrink-0">
                        {!n._aggregated && n.type === 'follow' && n.sender_id ? (
                          <FollowBackButton targetId={n.sender_id} isFollowingInitial={n._isFollowing} />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}