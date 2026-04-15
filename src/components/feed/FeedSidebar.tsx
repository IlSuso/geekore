'use client'
// FeedSidebar — Instagram desktop sidebar style:
// user card in cima, poi "Chi potresti seguire", poi trending minimal

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/Avatar'
import { TrendingUp, Film, BookOpen, Gamepad2, Tv, Dices } from 'lucide-react'

interface SuggestedUser {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
}

interface TrendingItem {
  title: string
  type: string
  cover_image: string | null
  count: number
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: BookOpen, game: Gamepad2,
  tv: Tv, movie: Film, boardgame: Dices,
}

// ── Suggested Users — Instagram style ─────────────────────────────────────────

function SuggestedUsers({ currentUserId }: { currentUserId: string | null }) {
  const [users, setUsers] = useState<SuggestedUser[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())
  const [currentProfile, setCurrentProfile] = useState<any>(null)

  useEffect(() => {
    if (!currentUserId) return
    const supabase = createClient()

    supabase.from('profiles').select('username, display_name, avatar_url').eq('id', currentUserId).single()
      .then(({ data }) => setCurrentProfile(data))

    const fetchSuggested = async () => {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', currentUserId)
      const followingIds = new Set((follows || []).map((f: any) => f.following_id))
      followingIds.add(currentUserId)
      const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url')
        .order('created_at', { ascending: false }).limit(20)
      setUsers(((data || []).filter((u: any) => !followingIds.has(u.id)).slice(0, 5)))
    }
    fetchSuggested()
  }, [currentUserId])

  const handleFollow = async (userId: string) => {
    if (!currentUserId) return
    const supabase = createClient()
    await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId })
    setFollowed(prev => new Set([...prev, userId]))
  }

  if (!currentProfile) return null

  return (
    <div>
      {/* Current user card */}
      <div className="flex items-center gap-3 mb-5 px-1">
        <Link href="/profile/me" className="flex-shrink-0">
          <div className="w-11 h-11 rounded-full overflow-hidden ring-[1.5px] ring-[var(--border)]">
            <Avatar src={currentProfile.avatar_url} username={currentProfile.username} displayName={currentProfile.display_name} size={44} />
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href="/profile/me">
            <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate hover:opacity-70 transition-opacity">
              {currentProfile.username}
            </p>
          </Link>
          <p className="text-[12px] text-[var(--text-secondary)] truncate">{currentProfile.display_name}</p>
        </div>
        <Link href="/settings" className="text-[12px] font-semibold text-violet-400 hover:text-violet-300 transition-colors flex-shrink-0">
          Impostazioni
        </Link>
      </div>

      {/* Suggested */}
      {users.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-[12px] font-semibold text-[var(--text-secondary)]">Suggeriti per te</p>
            <Link href="/explore" className="text-[11px] font-semibold text-[var(--text-primary)] hover:opacity-70 transition-opacity">
              Vedi tutti
            </Link>
          </div>

          <div className="space-y-3">
            {users.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-1">
                <Link href={`/profile/${user.username}`} className="flex-shrink-0">
                  <div className="w-9 h-9 rounded-full overflow-hidden">
                    <Avatar src={user.avatar_url} username={user.username} displayName={user.display_name} size={36} />
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${user.username}`}>
                    <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate hover:opacity-70 transition-opacity">
                      {user.username}
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
        </>
      )}
    </div>
  )
}

// ── Trending minimal ──────────────────────────────────────────────────────────

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
        setItems([...map.values()].sort((a, b) => b.count - a.count).slice(0, 5))
      })
  }, [])

  if (!items.length) return null

  return (
    <div className="mt-6 px-1">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold text-[var(--text-secondary)]">Trending questa settimana</p>
        <Link href="/trending" className="text-[11px] font-semibold text-[var(--text-primary)] hover:opacity-70 transition-opacity">
          Vedi tutti
        </Link>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => {
          const Icon = TYPE_ICON[item.type] || Film
          return (
            <div key={`${item.type}-${item.title}`} className="flex items-center gap-3">
              <span className="text-[12px] font-semibold text-[var(--text-muted)] w-4 text-center flex-shrink-0">{i + 1}</span>
              <div className="w-8 h-11 rounded-md overflow-hidden bg-[var(--bg-card)] flex-shrink-0">
                {item.cover_image
                  ? <img src={item.cover_image} alt={item.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={14} className="text-[var(--text-muted)]" /></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--text-primary)] truncate leading-tight">{item.title}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.count} {item.count === 1 ? 'aggiunta' : 'aggiunte'}</p>
              </div>
            </div>
          )
        })}
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
    <aside className="py-4">
      <SuggestedUsers currentUserId={currentUserId} />
      <TrendingMini />
      <FooterLinks />
    </aside>
  )
}