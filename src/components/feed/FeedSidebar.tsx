'use client'
// FeedSidebar — Instagram desktop sidebar style:
// user card in cima, poi "Chi potresti seguire", poi trending minimal

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/Avatar'
import { TrendingUp, Film, Gamepad2, Tv, Layers } from 'lucide-react'
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

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: Layers, game: Gamepad2,
  tv: Tv, movie: Film,
}

// ── Trending minimal ──────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Videogioco',
  tv: 'Serie TV', movie: 'Film',
}

function TrendingMini() {
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
        setItems([...map.values()].sort((a, b) => b.count - a.count).slice(0, 7))
      })
  }, [])

  if (!items.length) return null

  return (
    <div className="px-1">
      <div className="flex items-center gap-1.5 mb-3">
        <TrendingUp size={13} className="text-fuchsia-400" />
        <p className="text-[12px] font-semibold text-[var(--text-secondary)]">Trending questa settimana</p>
      </div>
      <div className="space-y-2.5">
        {items.map((item, i) => {
          const Icon = TYPE_ICON[item.type] || Film
          return (
            <div key={`${item.type}-${item.title}`} className="flex items-center gap-3 group">
              <span className="text-[11px] font-bold text-[var(--text-muted)] w-4 text-center flex-shrink-0 tabular-nums">{i + 1}</span>
              <div className="w-16 h-[88px] rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 ring-1 ring-white/10 shadow-md">
                {item.cover_image
                  ? <img src={item.cover_image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={18} className="text-[var(--text-muted)]" /></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-tight">{item.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-medium text-fuchsia-400/80 bg-fuchsia-500/10 px-1.5 py-px rounded-full">
                    {CATEGORY_LABEL[item.type] || item.type}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">{item.count} {item.count === 1 ? 'aggiunta' : 'aggiunte'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <Link href="/trending" className="text-[11px] font-semibold text-violet-400 hover:text-violet-300 transition-colors">
          Vedi tutti →
        </Link>
      </div>
    </div>
  )
}

// ── Footer links — Instagram style ────────────────────────────────────────────

function FooterLinks() {
  const links = ['Privacy', 'Termini', 'Cookie', 'Trending', 'News']
  return (
    <div className="mt-6 px-1">
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        {links.map(l => (
          <Link key={l} href={`/${l.toLowerCase()}`}
            className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
            {l}
          </Link>
        ))}
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mt-2">© 2025 Geekore</p>
    </div>
  )
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function FeedSidebar({ currentUserId }: { currentUserId: string | null }) {
  return (
    <aside className="px-4 py-4">
      <TrendingMini />
      {currentUserId && <SuggestedUsersCompact currentUserId={currentUserId} />}
      <FooterLinks />
    </aside>
  )
}

// ── Suggested Users (compact, senza user card in cima) ────────────────────────

function SuggestedUsersCompact({ currentUserId }: { currentUserId: string }) {
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
    const supabase = createClient()
    await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId })
    setFollowed(prev => new Set([...prev, userId]))
  }

  if (!users.length) return null

  return (
    <div className="mt-6 px-1">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-[var(--text-secondary)]">Suggeriti per te</p>
        <Link href="/community" className="text-[11px] font-semibold text-[var(--text-primary)] hover:opacity-70 transition-opacity">
          Vedi tutti
        </Link>
      </div>
      <div className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="flex items-center gap-3">
            <Link href={`/profile/${user.username}`} className="flex-shrink-0">
              <div className="w-9 h-9 rounded-full overflow-hidden">
                <Avatar src={user.avatar_url} username={user.username} displayName={user.display_name} size={36} />
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/profile/${user.username}`}>
                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate hover:opacity-70 transition-opacity">
                  <UserBadge badge={user.badge} displayName={user.display_name || user.username} />
                </p>
              </Link>
              <p className="text-[11px] text-[var(--text-secondary)] truncate">
                {user.display_name || 'Nuovo su Geekore'}
              </p>
            </div>
            {followed.has(user.id) ? (
              <span className="text-[12px] font-semibold text-[var(--text-secondary)] flex-shrink-0">Seguito ✓</span>
            ) : (
              <button
                onClick={() => handleFollow(user.id)}
                className="flex-shrink-0 text-[12px] font-semibold text-violet-400 hover:text-violet-300 transition-colors"
              >
                Segui
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}