'use client'

import React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap, Gamepad2, Tv, Trophy, Medal, Crown, Users, Sparkles } from 'lucide-react'
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

const TABS: Array<{ id: LeaderboardTab; label: string; short: string; icon: React.ReactNode }> = [
  { id: 'score', label: 'Geek Score', short: 'Score', icon: <Zap size={13} /> },
  { id: 'game_hours', label: 'Ore Steam', short: 'Steam', icon: <Gamepad2 size={13} /> },
  { id: 'anime_count', label: 'Anime tracciati', short: 'Anime', icon: <Tv size={13} /> },
]

function formatValue(leader: Leader, tab: LeaderboardTab): string {
  if (tab === 'game_hours') return `${Math.round(leader.game_hours || 0).toLocaleString('it')}h`
  if (tab === 'anime_count') return `${leader.anime_count.toLocaleString('it')} anime`
  return `${leader.score.toLocaleString('it')} pts`
}

function metricLabel(tab: LeaderboardTab): string {
  if (tab === 'game_hours') return 'ore Steam'
  if (tab === 'anime_count') return 'anime'
  return 'Geek Score'
}

function CompactStat({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-black/16 px-3 py-2.5 ring-1 ring-white/5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[rgba(230,255,61,0.09)] text-[var(--accent)]">{icon}</div>
      <div className="min-w-0">
        <p className="font-mono-data text-[18px] font-black leading-none text-[var(--text-primary)]">{value}</p>
        <p className="gk-label mt-1 truncate">{label}</p>
      </div>
    </div>
  )
}

function PodiumCard({ leader, rank, tab }: { leader: Leader; rank: number; tab: LeaderboardTab }) {
  const medalClass = rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-zinc-300' : 'text-amber-600'
  return (
    <Link
      href={`/profile/${leader.username}`}
      data-no-swipe="true"
      className={`group relative overflow-hidden rounded-[26px] border bg-[var(--bg-card)] p-4 ring-1 ring-white/5 transition-all hover:-translate-y-0.5 hover:border-[rgba(230,255,61,0.34)] ${rank === 1 ? 'border-[rgba(230,255,61,0.30)] md:scale-[1.03]' : 'border-[var(--border-subtle)]'}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(230,255,61,0.09),transparent_52%)] opacity-80" />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-black/22 ring-1 ring-white/5">
          {rank === 1 ? <Crown size={20} className={medalClass} /> : <Medal size={20} className={medalClass} />}
        </div>
        <Avatar src={leader.avatar_url} username={leader.username} displayName={leader.display_name} size={rank === 1 ? 70 : 58} className="rounded-[22px] shadow-[0_16px_38px_rgba(0,0,0,0.26)]" />
        <p className="mt-3 max-w-full truncate text-[15px] font-black text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">{leader.display_name || leader.username}</p>
        <p className="gk-mono text-[var(--text-muted)]">@{leader.username}</p>
        <div className="mt-3 rounded-2xl border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.08)] px-3 py-1.5">
          <p className="font-mono-data text-[15px] font-black text-[var(--accent)]">{formatValue(leader, tab)}</p>
        </div>
      </div>
    </Link>
  )
}

function LeaderRow({ leader, rank, tab }: { leader: Leader; rank: number; tab: LeaderboardTab }) {
  const medalClass = rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-zinc-300' : rank === 3 ? 'text-amber-600' : 'text-[var(--text-muted)]'
  return (
    <Link
      href={`/profile/${leader.username}`}
      data-no-swipe="true"
      className="group grid grid-cols-[40px_44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
        {rank <= 3 ? <Medal size={18} className={medalClass} /> : <span className="font-mono-data text-xs font-black text-[var(--text-muted)]">#{rank}</span>}
      </div>
      <Avatar src={leader.avatar_url} username={leader.username} displayName={leader.display_name} size={42} className="rounded-2xl" />
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">{leader.display_name || leader.username}</p>
        <p className="gk-mono text-[var(--text-muted)]">@{leader.username}</p>
      </div>
      <div className="text-right">
        <p className="font-mono-data text-sm font-black text-[var(--text-primary)]">{formatValue(leader, tab)}</p>
        <p className="hidden text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] sm:block">{metricLabel(tab)}</p>
      </div>
    </Link>
  )
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

  const podium = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const totalScore = leaders.reduce((sum, leader) => sum + (leader.score || 0), 0)
  const totalGameHours = leaders.reduce((sum, leader) => sum + (leader.game_hours || 0), 0)

  return (
    <PageScaffold
      title="Classifica"
      description="Il lato competitivo della community Geekore."
      icon={<Trophy size={16} />}
      contentClassName="mx-auto max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      <section className="mb-5 overflow-hidden rounded-[28px] border border-[rgba(230,255,61,0.16)] bg-[radial-gradient(circle_at_18%_0%,rgba(230,255,61,0.12),transparent_42%),linear-gradient(135deg,rgba(230,255,61,0.055),rgba(18,18,26,0.96))] p-5 ring-1 ring-white/5">
        <div className="mb-2 gk-section-eyebrow"><Trophy size={13} /> Community ranking</div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-[34px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)] md:text-[42px]">Classifica</h1>
            <p className="mt-2 max-w-xl text-[14px] leading-6 text-[var(--text-secondary)]">Score, ore e anime tracciati: una lettura veloce di chi sta spingendo di più nella community.</p>
          </div>
          <div className="flex gap-2 rounded-[20px] border border-[var(--border)] bg-black/18 p-1.5" data-no-swipe="true" role="tablist" aria-label="Ordina classifica">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                data-no-swipe="true"
                onClick={() => setTab(item.id)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-2xl px-3 text-xs font-black transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                style={tab === item.id ? { background: 'var(--accent)', color: '#0B0B0F' } : { color: 'var(--text-secondary)' }}
                title={item.label}
              >
                {item.icon}<span>{item.short}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <CompactStat label="utenti" value={leaders.length} icon={<Users size={14} />} />
          <CompactStat label="score tot." value={totalScore.toLocaleString('it')} icon={<Zap size={14} />} />
          <CompactStat label="ore game" value={Math.round(totalGameHours).toLocaleString('it')} icon={<Gamepad2 size={14} />} />
        </div>
      </section>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <SkeletonLeaderboardRow key={i} />)}</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <Trophy size={30} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun dato disponibile</p>
          <p className="gk-body mx-auto max-w-sm">Aggiungi media alla tua collezione per entrare nella classifica.</p>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <section className="mb-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={15} className="text-[var(--accent)]" />
                <h2 className="gk-label">Podio attuale</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3 md:items-end">
                {podium.map((leader, index) => <PodiumCard key={leader.user_id} leader={leader} rank={index + 1} tab={tab} />)}
              </div>
            </section>
          )}

          <section className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/55 p-3 ring-1 ring-white/5">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <h2 className="gk-label">Ranking completo</h2>
              <span className="rounded-full border border-[var(--border)] px-2 py-1 font-mono-data text-[10px] font-black text-[var(--text-muted)]">{sorted.length} utenti</span>
            </div>
            <div className="space-y-2">
              {rest.length > 0
                ? rest.map((leader, i) => <LeaderRow key={leader.user_id} leader={leader} rank={i + 4} tab={tab} />)
                : podium.map((leader, i) => <LeaderRow key={leader.user_id} leader={leader} rank={i + 1} tab={tab} />)}
            </div>
          </section>
        </>
      )}
    </PageScaffold>
  )
}
