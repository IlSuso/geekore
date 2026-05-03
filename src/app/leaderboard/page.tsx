'use client'

import React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Gamepad2, Tv, Trophy, Medal, Crown } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { SkeletonLeaderboardRow } from '@/components/ui/SkeletonCard'
import { PageScaffold } from '@/components/ui/PageScaffold'

let leaderboardCache: { data: any[]; ts: number } | null = null
const LEADERBOARD_CACHE_TTL = 3 * 60 * 1000

type LeaderboardTab = 'score' | 'game_hours' | 'anime_count'

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

function RankingStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

function formatValue(leader: Leader, tab: LeaderboardTab): string {
  if (tab === 'game_hours') return `${Math.round(leader.game_hours || 0).toLocaleString('it')}h`
  if (tab === 'anime_count') return `${leader.anime_count.toLocaleString('it')} anime`
  return `${leader.score.toLocaleString('it')} pts`
}

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<LeaderboardTab>('score')
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      if (leaderboardCache && Date.now() - leaderboardCache.ts < LEADERBOARD_CACHE_TTL) {
        setLeaders(leaderboardCache.data as Leader[])
        setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('get_leaderboard', { limit_count: 50 })
      if (!error && data) {
        setLeaders(data as Leader[])
        leaderboardCache = { data: data as Leader[], ts: Date.now() }
      }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => [...leaders].sort((a, b) => {
    if (tab === 'game_hours') return b.game_hours - a.game_hours
    if (tab === 'anime_count') return b.anime_count - a.anime_count
    return b.score - a.score
  }), [leaders, tab])

  const topLeader = sorted[0]
  const totalScore = leaders.reduce((sum, leader) => sum + (leader.score || 0), 0)
  const totalGameHours = leaders.reduce((sum, leader) => sum + (leader.game_hours || 0), 0)

  return (
    <PageScaffold
      title="Classifica"
      description="Geek Score, ore giocate e anime tracciati dalla community."
      icon={<Trophy size={16} />}
      contentClassName="pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 grid grid-cols-3 gap-3">
        <RankingStat label="utenti" value={leaders.length} accent />
        <RankingStat label="score tot." value={totalScore.toLocaleString('it')} />
        <RankingStat label="ore game" value={Math.round(totalGameHours).toLocaleString('it')} />
      </div>

      <div
        className="mb-5 flex gap-2 rounded-[20px] border border-[var(--border)] bg-[var(--bg-card)] p-1.5"
        data-no-swipe="true"
        data-interactive="true"
        role="tablist"
        aria-label="Ordina classifica"
      >
        {([
          ['score', <><Zap size={12} /> Geek Score</>],
          ['game_hours', <><Gamepad2 size={12} /> Steam</>],
          ['anime_count', <><Tv size={12} /> Anime</>],
        ] as [LeaderboardTab, React.ReactNode][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-no-swipe="true"
            onClick={() => setTab(id)}
            onPointerDown={event => event.stopPropagation()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2 text-xs font-black transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            style={tab === id
              ? { background: 'var(--accent)', color: '#0B0B0F' }
              : { color: 'var(--text-secondary)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {topLeader && !loading && (
        <Link
          href={`/profile/${topLeader.username}`}
          data-no-swipe="true"
          className="mb-4 flex items-center gap-3 rounded-[24px] border border-[rgba(230,255,61,0.28)] bg-[linear-gradient(135deg,rgba(230,255,61,0.10),rgba(255,255,255,0.025))] p-4 transition-colors hover:border-[rgba(230,255,61,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-[#0B0B0F] shadow-[0_0_28px_rgba(230,255,61,0.2)]">
            <Crown size={22} />
          </div>
          <Avatar src={topLeader.avatar_url} username={topLeader.username} displayName={topLeader.display_name} size={46} className="rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="gk-label text-[var(--accent)]">Top della community</p>
            <p className="truncate text-[15px] font-black text-[var(--text-primary)]">{topLeader.display_name || topLeader.username}</p>
            <p className="gk-mono text-[var(--text-muted)]">@{topLeader.username}</p>
          </div>
          <p className="font-mono-data text-sm font-black text-[var(--text-primary)]">
            {formatValue(topLeader, tab)}
          </p>
        </Link>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonLeaderboardRow key={i} />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <Trophy size={30} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun dato disponibile</p>
          <p className="gk-body mx-auto max-w-sm">Aggiungi media alla Library per entrare nella classifica.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((leader, i) => {
            const value = formatValue(leader, tab)
            const rank = i + 1
            const medalClass = rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-zinc-300' : rank === 3 ? 'text-amber-600' : 'text-[var(--text-muted)]'

            return (
              <Link
                key={leader.user_id}
                href={`/profile/${leader.username}`}
                data-no-swipe="true"
                className="group flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)] animate-in fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                style={{ animationDelay: `${i * 24}ms` }}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
                  {rank <= 3
                    ? <Medal size={18} className={medalClass} />
                    : <span className="font-mono-data text-xs font-black text-[var(--text-muted)]">#{rank}</span>}
                </div>

                <Avatar src={leader.avatar_url} username={leader.username} displayName={leader.display_name} size={40} className="rounded-2xl" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
                    {leader.display_name || leader.username}
                  </p>
                  <p className="gk-mono text-[var(--text-muted)]">@{leader.username}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className="font-mono-data text-sm font-black text-[var(--text-primary)]">{value}</p>
                  {tab === 'score' && (
                    <p className="flex items-center justify-end gap-1 text-[10px] text-[var(--text-muted)]">
                      {leader.anime_count > 0 && <><Tv size={9} />{leader.anime_count}</>}
                      {leader.game_hours > 0 && <><Gamepad2 size={9} />{Math.round(leader.game_hours)}h</>}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </PageScaffold>
  )
}
