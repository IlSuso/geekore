'use client'
import React from 'react'
// src/app/leaderboard/page.tsx
// A7: Usa RPC get_leaderboard() server-side invece del full-scan client
// P5: SkeletonLeaderboardRow durante il loading
// PERF: cache in-memory lato client (3 min TTL) — evita spinner ad ogni visita

import { useEffect, useState } from 'react'

// Cache modulo-level: sopravvive alle navigazioni SPA
let leaderboardCache: { data: any[]; ts: number } | null = null
const LEADERBOARD_CACHE_TTL = 3 * 60 * 1000 // 3 minuti
import { createClient } from '@/lib/supabase/client'
import { Loader2, Zap, Gamepad2, Tv, Trophy, Medal } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { SkeletonLeaderboardRow } from '@/components/ui/SkeletonCard'

interface Leader {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  score: number
  anime_count: number
  game_hours: number
  manga_count: number
  movie_count: number
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'score' | 'game_hours' | 'anime_count'>('score')
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      // Cache hit: mostra subito i dati senza spinner
      if (leaderboardCache && Date.now() - leaderboardCache.ts < LEADERBOARD_CACHE_TTL) {
        setLeaders(leaderboardCache.data as Leader[])
        setLoading(false)
        return
      }
      // A7: RPC server-side — nessun full-scan client-side
      const { data, error } = await supabase.rpc('get_leaderboard', { limit_count: 50 })
      if (!error && data) {
        setLeaders(data as Leader[])
        leaderboardCache = { data: data as Leader[], ts: Date.now() }
      }
      setLoading(false)
    }
    load()
  }, [])

  const sorted = [...leaders].sort((a, b) => {
    if (tab === 'game_hours') return b.game_hours - a.game_hours
    if (tab === 'anime_count') return b.anime_count - a.anime_count
    return b.score - a.score
  })

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] pt-3 md:pt-8 pb-32 px-4 text-white">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="hidden md:block text-5xl font-black tracking-tighter">Classifica</h1>
          <p className="text-zinc-500 text-sm mt-1">Geek Score su tutti i media tracciati</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5">
          {([
            ['score',       <><Zap size={12} /> Geek Score</>],
            ['game_hours',  <><Gamepad2 size={12} /> Ore Steam</>],
            ['anime_count', <><Tv size={12} /> Anime</>],
          ] as [string, React.ReactNode][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id as 'score' | 'game_hours' | 'anime_count')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${tab === id ? '' : 'text-zinc-400 hover:text-white'}`}
              style={tab === id ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        {/* P5: skeleton durante loading */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonLeaderboardRow key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((leader, i) => {
              // M3: stagger — ogni riga entra con delay crescente
              const value = tab === 'game_hours'
                ? `${leader.game_hours}h`
                : tab === 'anime_count'
                  ? `${leader.anime_count} anime`
                  : `${leader.score.toLocaleString('it')} pts`

              const medalColor = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : null

              return (
                <Link
                  key={leader.user_id}
                  href={`/profile/${leader.username}`}
                  className="flex items-center gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl hover:border-zinc-600 transition-all group animate-in fade-in"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {/* Rank */}
                  <div className="w-8 text-center flex-shrink-0">
                    {medalColor
                      ? <Trophy size={18} className={medalColor} />
                      : <span className="text-sm font-bold text-zinc-600">#{i + 1}</span>}
                  </div>

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-2xl overflow-hidden flex-shrink-0">
                    <Avatar
                      src={leader.avatar_url}
                      username={leader.username}
                      displayName={leader.display_name}
                      size={40}
                      className="rounded-2xl"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white truncate group-hover:text-[var(--accent)] transition-colors">
                      {leader.display_name || leader.username}
                    </p>
                    <p className="text-xs text-zinc-500">@{leader.username}</p>
                  </div>

                  {/* Score */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm text-white">{value}</p>
                    {tab === 'score' && (
                      <p className="text-[10px] text-zinc-600 flex items-center gap-1 justify-end">
                        {leader.anime_count > 0 && <><Tv size={9} />{leader.anime_count}</>}
                        {leader.game_hours > 0 && <><Gamepad2 size={9} />{leader.game_hours}h</>}
                      </p>
                    )}
                  </div>
                </Link>
              )
            })}

            {sorted.length === 0 && (
              <div className="text-center py-20 text-zinc-600">
                <p>Nessun dato disponibile</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}