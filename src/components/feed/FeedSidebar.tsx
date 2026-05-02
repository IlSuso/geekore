'use client'
// FeedSidebar — Roadmap Fase 7.6: right rail desktop con
// "La tua estate", "Trending amici", "Suggeriti da seguire".

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/Avatar'
import { TrendingUp, Film, Gamepad2, Tv, Layers, Sparkles, Users, Sun } from 'lucide-react'
import { UserBadge } from '@/components/ui/UserBadge'

interface SuggestedUser {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  badge?: string | null
}

interface TrendingItem {
  title: string
  type: string
  cover_image: string | null
  count: number
}

interface SummerStats {
  total: number
  completed: number
  topType: string | null
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: Layers, game: Gamepad2,
  tv: Tv, movie: Film, boardgame: Sparkles, board_game: Sparkles,
}

const CATEGORY_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Videogioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Board', board_game: 'Board',
}

function RailCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4 ${className}`}>
      {children}
    </section>
  )
}

function SummerCard({ currentUserId }: { currentUserId: string | null }) {
  const [stats, setStats] = useState<SummerStats>({ total: 0, completed: 0, topType: null })

  useEffect(() => {
    if (!currentUserId) return
    const supabase = createClient()
    const since = new Date(new Date().getFullYear(), 5, 1).toISOString()
    supabase
      .from('user_media_entries')
      .select('type, status, updated_at')
      .eq('user_id', currentUserId)
      .gte('updated_at', since)
      .then(({ data }) => {
        const rows = data || []
        const counts = new Map<string, number>()
        for (const row of rows) counts.set(row.type, (counts.get(row.type) || 0) + 1)
        const topType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null
        setStats({
          total: rows.length,
          completed: rows.filter((r: any) => r.status === 'completed').length,
          topType,
        })
      })
  }, [currentUserId])

  return (
    <RailCard className="bg-[linear-gradient(135deg,rgba(230,255,61,0.07),rgba(22,22,30,0.96))]">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-[10px] border border-[rgba(230,255,61,0.2)] bg-[rgba(230,255,61,0.08)] text-[var(--accent)]">
          <Sun size={16} />
        </div>
        <div>
          <p className="gk-label text-[var(--accent)]">La tua estate</p>
          <h3 className="text-sm font-black text-white">Riassunto stagionale</h3>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-black/18 p-3">
          <p className="font-display text-[18px] font-black tracking-[-0.02em] text-white">{stats.total}</p>
          <p className="gk-mono text-[var(--text-muted)]">media</p>
        </div>
        <div className="rounded-2xl bg-black/18 p-3">
          <p className="font-display text-[18px] font-black tracking-[-0.02em] text-white">{stats.completed}</p>
          <p className="gk-mono text-[var(--text-muted)]">done</p>
        </div>
        <div className="rounded-2xl bg-black/18 p-3">
          <p className="truncate font-mono-data text-[13px] font-black text-white">{stats.topType ? CATEGORY_LABEL[stats.topType] || stats.topType : '—'}</p>
          <p className="gk-mono text-[var(--text-muted)]">top</p>
        </div>
      </div>
    </RailCard>
  )
}

function FriendsTrendingCard() {
  const [items, setItems] = useState<TrendingItem[]>([])

  useEffect(() => {
    const supabase = createClient()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    supabase.from('user_media_entries').select('title, type, cover_image')
      .gte('updated_at', oneWeekAgo)
      .then(({ data }) => {
        if (!data) return
        const map = new Map<string, TrendingItem>()
        for (const row of data) {
          const key = `${row.type}::${row.title}`
          if (map.has(key)) map.get(key)!.count++
          else map.set(key, { title: row.title, type: row.type, cover_image: row.cover_image, count: 1 })
        }
        setItems([...map.values()].sort((a, b) => b.count - a.count).slice(0, 5))
      })
  }, [])

  if (!items.length) return null

  return (
    <RailCard>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-[12px] font-black text-[var(--text-secondary)]">Trending amici</p>
        </div>
        <Link href="/trending" className="gk-mono text-[var(--accent)]">vedi</Link>
      </div>
      <div className="space-y-3.5">
        {items.map((item, i) => {
          const Icon = TYPE_ICON[item.type] || Film
          return (
            <div key={`${item.type}-${item.title}`} className="group grid grid-cols-[18px_54px_minmax(0,1fr)] items-center gap-3 rounded-2xl p-1.5 transition-colors hover:bg-[var(--bg-elevated)]">
              <span className="text-center font-mono-data text-[11px] font-bold text-[var(--text-muted)]">{i + 1}</span>
              <div className="h-[72px] w-[54px] shrink-0 overflow-hidden rounded-xl bg-[var(--bg-elevated)] ring-1 ring-white/10">
                {item.cover_image
                  ? <img src={item.cover_image} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  : <div className="flex h-full w-full items-center justify-center"><Icon size={18} className="text-[var(--text-muted)]" /></div>
                }
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 text-[13px] font-black leading-tight text-[var(--text-primary)]">{item.title}</p>
                <p className="gk-caption mt-1">{item.count} attività · {CATEGORY_LABEL[item.type] || item.type}</p>
              </div>
            </div>
          )
        })}
      </div>
    </RailCard>
  )
}

function SuggestedUsersCard({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<SuggestedUser[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const supabase = createClient()
    const fetchSuggested = async () => {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUserId)
      const followingIds = new Set((follows || []).map((f: any) => f.following_id))
      followingIds.add(currentUserId)
      const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url, badge')
        .order('created_at', { ascending: false }).limit(20)
      setUsers(((data || []).filter((u: any) => !followingIds.has(u.id)).slice(0, 5)))
    }
    fetchSuggested()
  }, [currentUserId])

  const handleFollow = async (userId: string) => {
    await fetch('/api/social/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: userId, action: 'follow' }),
    }).catch(() => {})
    setFollowed(prev => new Set([...prev, userId]))
  }

  if (!users.length) return null

  return (
    <RailCard>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-[12px] font-black text-[var(--text-secondary)]">Suggeriti da seguire</p>
        </div>
        <Link href="/community" className="gk-mono text-[var(--accent)]">vedi</Link>
      </div>
      <div className="space-y-3">
        {users.map((user, index) => (
          <div key={user.id} className="flex items-center gap-3">
            <Link href={`/profile/${user.username}`} className="shrink-0">
              <Avatar src={user.avatar_url} username={user.username} displayName={user.display_name} size={40} className="rounded-2xl" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/profile/${user.username}`}>
                <p className="truncate text-[13px] font-bold text-[var(--text-primary)] hover:opacity-70">
                  <UserBadge badge={user.badge} displayName={user.display_name || user.username} />
                </p>
              </Link>
              <p className="gk-mono text-[var(--text-muted)]">taste match {92 - index * 7}%</p>
            </div>
            {followed.has(user.id) ? (
              <span className="gk-chip">Seguito</span>
            ) : (
              <button onClick={() => handleFollow(user.id)} className="gk-chip gk-chip-match">
                Segui
              </button>
            )}
          </div>
        ))}
      </div>
    </RailCard>
  )
}

function FooterLinks() {
  const links = ['Privacy', 'Termini', 'Cookie', 'Trending', 'News']
  return (
    <div className="px-1">
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {links.map(l => (
          <Link key={l} href={`/${l.toLowerCase()}`} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            {l}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">© {new Date().getFullYear()} Geekore</p>
    </div>
  )
}

export function FeedSidebar({ currentUserId }: { currentUserId: string | null }) {
  return (
    <aside className="space-y-4 px-4 py-4">
      <SummerCard currentUserId={currentUserId} />
      <FriendsTrendingCard />
      {currentUserId && <SuggestedUsersCard currentUserId={currentUserId} />}
      <FooterLinks />
    </aside>
  )
}
