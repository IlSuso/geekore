'use client'
// src/app/search/page.tsx
// 6.2 — Ricerca utenti funzionante con debounce, card avatar/stats, follow

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Users, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { UserBadge } from '@/components/ui/UserBadge'
import { FollowButton } from '@/components/profile/follow-button'

type UserResult = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  badge?: string | null
  media_count: number
  followers_count: number
}

export default function SearchPage() {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id || null)
    })
    // Autofocus
    inputRef.current?.focus()
  }, [])

  const searchUsers = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearched(false)
      return
    }

    setLoading(true)
    setSearched(true)

    const { data: profilesData, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, badge')
      .or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`)
      .limit(20)

    if (error || !profilesData) {
      setLoading(false)
      return
    }

    // Arricchisci con conteggi media e follower
    const enriched: UserResult[] = await Promise.all(
      profilesData.map(async (p) => {
        const [mediaRes, followersRes] = await Promise.all([
          supabase
            .from('user_media_entries')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', p.id),
          supabase
            .from('follows')
            .select('follower_id', { count: 'exact', head: true })
            .eq('following_id', p.id),
        ])
        return {
          ...p,
          media_count: mediaRes.count || 0,
          followers_count: followersRes.count || 0,
        }
      })
    )

    setResults(enriched)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchUsers(query), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, searchUsers])

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setSearched(false)
    inputRef.current?.focus()
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-24 text-white">
      <div className="max-w-screen-2xl mx-auto px-4 pt-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Cerca utenti</h1>
          <p className="text-zinc-500 text-sm">Trova persone e scopri le loro collezioni</p>
        </div>

        {/* Search input */}
        <div className="relative mb-6">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none">
            {loading
              ? <Loader2 size={18} className="animate-spin" style={{ color: '#E6FF3D' }} />
              : <Search size={18} />}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per username o nome..."
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl pl-11 pr-11 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Empty state — no query */}
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mb-4">
              <Users size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-medium">Cerca un utente</p>
            <p className="text-zinc-700 text-sm mt-1 max-w-xs">
              Digita almeno 2 caratteri per cercare per username o nome
            </p>
          </div>
        )}

        {/* No results */}
        {searched && !loading && results.length === 0 && query.trim().length >= 2 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mb-4">
              <Search size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-medium">Nessun utente trovato</p>
            <p className="text-zinc-700 text-sm mt-1">Prova con un termine diverso</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-600 mb-4">
              {results.length} {results.length === 1 ? 'risultato' : 'risultati'}
            </p>
            {results.map(user => (
              <div
                key={user.id}
                className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition-colors"
              >
                {/* Avatar — link al profilo */}
                <Link href={`/profile/${user.username}`} className="shrink-0">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-violet-500/20">
                    <Avatar
                      src={user.avatar_url}
                      username={user.username}
                      displayName={user.display_name}
                      size={48}
                      className="rounded-2xl"
                    />
                  </div>
                </Link>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${user.username}`} className="block">
                    <p className="font-semibold text-white truncate leading-tight">
                      <UserBadge badge={user.badge} displayName={user.display_name || user.username} />
                    </p>
                    <p className="text-xs text-zinc-500 truncate">@{user.username}</p>
                  </Link>
                  {user.bio && (
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{user.bio}</p>
                  )}
                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-zinc-600">
                      <span className="text-zinc-400 font-medium">{user.media_count}</span> nella collezione
                    </span>
                    <span className="text-zinc-800">·</span>
                    <span className="text-[10px] text-zinc-600">
                      <span className="text-zinc-400 font-medium">{user.followers_count}</span>{' '}
                      {user.followers_count === 1 ? 'follower' : 'follower'}
                    </span>
                  </div>
                </div>

                {/* Follow button — solo se non sei te stesso */}
                {currentUserId && currentUserId !== user.id && (
                  <div className="shrink-0">
                    <FollowButton
                      targetId={user.id}
                      currentUserId={currentUserId}
                      isFollowingInitial={false}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}