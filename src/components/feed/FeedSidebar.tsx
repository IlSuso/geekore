'use client'
// src/components/feed/FeedSidebar.tsx
// Sidebar del feed — pattern Twitter/X: trending, utenti suggeriti, link rapidi

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/Avatar'
import { TrendingUp, Users, Sparkles, Film, BookOpen, Gamepad2, Tv, Dices, Star } from 'lucide-react'

// ─── Tipi ─────────────────────────────────────────────────────────────────────

interface TrendingItem {
  title: string
  type: string
  cover_image: string | null
  count: number
  avg_rating: number | null
}

interface SuggestedUser {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
}

// ─── Costanti ─────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500', boardgame: 'bg-yellow-500',
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: BookOpen, game: Gamepad2,
  tv: Tv, movie: Film, boardgame: Dices,
}

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Board Game',
}

// ─── Trending widget ──────────────────────────────────────────────────────────

function TrendingWidget() {
  const [items, setItems] = useState<TrendingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    supabase
      .from('user_media_entries')
      .select('title, type, cover_image, external_id')
      .gte('updated_at', oneWeekAgo)
      .then(({ data }) => {
        if (!data) { setLoading(false); return }
        const map = new Map<string, TrendingItem>()
        for (const row of data) {
          const key = `${row.type}::${row.title}`
          if (map.has(key)) {
            map.get(key)!.count++
          } else {
            map.set(key, { title: row.title, type: row.type, cover_image: row.cover_image, count: 1, avg_rating: null })
          }
        }
        const sorted = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6)
        setItems(sorted)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-zinc-800 rounded mb-4" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="flex items-center gap-3 mb-3">
            <div className="w-8 h-11 bg-zinc-800 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-zinc-800 rounded w-3/4" />
              <div className="h-2.5 bg-zinc-800 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!items.length) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={15} className="text-violet-400" />
          <h3 className="text-sm font-bold text-white">Trending questa settimana</h3>
        </div>
        <Link href="/trending" className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
          Vedi tutto
        </Link>
      </div>

      <div className="space-y-3">
        {items.map((item, i) => {
          const Icon = TYPE_ICON[item.type] || Film
          return (
            <div key={`${item.type}-${item.title}`} className="flex items-center gap-3 group">
              {/* Rank */}
              <span className="text-xs font-bold text-zinc-600 w-4 flex-shrink-0 text-right">
                {i + 1}
              </span>
              {/* Cover */}
              <div className="w-8 h-11 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                {item.cover_image ? (
                  <img
                    src={item.cover_image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      if (img.src.includes('anilist.co') && !img.src.includes('wsrv.nl')) {
                        img.src = `https://wsrv.nl/?url=${encodeURIComponent(img.src)}&w=500&output=jpg`
                      } else {
                        img.onerror = null
                        img.style.display = 'none'
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon size={14} className="text-zinc-600" />
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate leading-tight">{item.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${TYPE_COLOR[item.type] || 'bg-zinc-700'}`}>
                    {TYPE_LABEL[item.type] || item.type}
                  </span>
                  <span className="text-[10px] text-zinc-500">{item.count} {item.count === 1 ? 'aggiunta' : 'aggiunte'}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Utenti suggeriti ─────────────────────────────────────────────────────────

function SuggestedUsersWidget({ currentUserId }: { currentUserId: string | null }) {
  const [users, setUsers] = useState<SuggestedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!currentUserId) { setLoading(false); return }
    const supabase = createClient()

    // Carica chi già segui
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)
      .then(({ data: follows }) => {
        const followingIds = new Set((follows || []).map((f: any) => f.following_id))
        followingIds.add(currentUserId) // escludi se stesso

        // Carica profili recenti non ancora seguiti
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .order('created_at', { ascending: false })
          .limit(20)
          .then(({ data }) => {
            const filtered = (data || [])
              .filter((u: any) => !followingIds.has(u.id))
              .slice(0, 4)
            setUsers(filtered)
            setLoading(false)
          })
      })
      .catch(() => setLoading(false))
  }, [currentUserId])

  const handleFollow = async (userId: string) => {
    if (!currentUserId) return
    const supabase = createClient()
    await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId })
    setFollowed(prev => new Set([...prev, userId]))
  }

  if (loading || !users.length) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users size={15} className="text-violet-400" />
        <h3 className="text-sm font-bold text-white">Chi potresti seguire</h3>
      </div>

      <div className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="flex items-center gap-3">
            <Link href={`/profile/${user.username}`} className="flex-shrink-0">
              <div className="w-9 h-9 rounded-xl overflow-hidden ring-2 ring-zinc-800 hover:ring-violet-500/50 transition-all">
                <Avatar
                  src={user.avatar_url}
                  username={user.username}
                  displayName={user.display_name}
                  size={36}
                />
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/profile/${user.username}`}>
                <p className="text-xs font-semibold text-white truncate hover:text-violet-400 transition-colors">
                  {user.display_name || user.username}
                </p>
              </Link>
              <p className="text-[10px] text-zinc-500">@{user.username}</p>
            </div>
            {followed.has(user.id) ? (
              <span className="text-[10px] text-emerald-400 font-medium flex-shrink-0">Seguito</span>
            ) : (
              <button
                onClick={() => handleFollow(user.id)}
                className="flex-shrink-0 px-3 py-1 bg-white text-black text-[10px] font-bold rounded-full hover:bg-zinc-200 transition-all"
              >
                Segui
              </button>
            )}
          </div>
        ))}
      </div>

      <Link href="/explore" className="block mt-4 text-xs text-violet-400 hover:text-violet-300 transition-colors">
        Scopri altri utenti →
      </Link>
    </div>
  )
}

// ─── Link rapidi ──────────────────────────────────────────────────────────────

function QuickLinksWidget() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={15} className="text-violet-400" />
        <h3 className="text-sm font-bold text-white">Esplora</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { href: '/discover', label: 'Scopri', icon: Sparkles, color: 'text-violet-400' },
          { href: '/for-you', label: 'Per te', icon: Star, color: 'text-yellow-400' },
          { href: '/trending', label: 'Trending', icon: TrendingUp, color: 'text-fuchsia-400' },
          { href: '/explore', label: 'Utenti', icon: Users, color: 'text-sky-400' },
        ].map(({ href, label, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors group"
          >
            <Icon size={14} className={`${color} flex-shrink-0`} />
            <span className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── Sidebar principale ───────────────────────────────────────────────────────

export function FeedSidebar({ currentUserId }: { currentUserId: string | null }) {
  return (
    <aside className="space-y-4">
      <QuickLinksWidget />
      <TrendingWidget />
      <SuggestedUsersWidget currentUserId={currentUserId} />
      <p className="text-[10px] text-zinc-700 px-2 leading-relaxed">
        Geekore · <Link href="/privacy" className="hover:text-zinc-500 transition-colors">Privacy</Link>
        {' · '}<Link href="/terms" className="hover:text-zinc-500 transition-colors">Termini</Link>
      </p>
    </aside>
  )
}