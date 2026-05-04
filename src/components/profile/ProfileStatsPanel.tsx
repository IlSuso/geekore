'use client'
// src/components/profile/ProfileStatsPanel.tsx
// Profile DNA: griglia tipi media + metriche + generi dominanti

import React, { useMemo } from 'react'
import { Star, Clock, Tv, Layers, Sparkles, Gamepad2, Film, Dice5 } from 'lucide-react'
import { useLocale } from '@/lib/locale'

type UserMedia = {
  id: string
  type: string
  is_steam?: boolean
  current_episode: number
  rating?: number
  genres?: string[]
}

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  anime:     { label: 'Anime',    color: 'var(--type-anime)',    bg: 'rgba(56,189,248,0.10)',  icon: Tv },
  tv:        { label: 'Serie TV', color: 'var(--type-tv)',       bg: 'rgba(192,132,252,0.10)', icon: Tv },
  manga:     { label: 'Manga',    color: 'var(--type-manga)',    bg: 'rgba(249,112,102,0.10)', icon: Layers },
  game:      { label: 'Game',     color: 'var(--type-game)',     bg: 'rgba(74,222,128,0.10)',  icon: Gamepad2 },
  movie:     { label: 'Film',     color: 'var(--type-movie)',    bg: 'rgba(239,68,68,0.10)',   icon: Film },
  boardgame: { label: 'Board',    color: 'var(--type-board)',    bg: 'rgba(251,146,60,0.10)',  icon: Dice5 },
}

function normalizeType(type: string): string {
  return type === 'board_game' ? 'boardgame' : type
}

function ProfileDNAStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-display text-[20px] font-black leading-none tracking-[-0.03em] ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

export function ProfileStatsPanel({ mediaList }: { mediaList: UserMedia[] }) {
  const { locale } = useLocale()
  const copy = locale === 'it' ? { tv: 'Serie TV', game: 'Game', movie: 'Film', boardgame: 'Board', steamHours: 'Ore Steam', animeHours: 'Ore anime', mangaChapters: 'Cap. manga', avgRating: 'Voto medio', dna: 'Profile DNA', footprint: 'Impronta media', caption: 'Distribuzione, ore e generi dominanti della libreria.', titles: 'titoli', rated: 'valutati', rating: 'rating' } : { tv: 'TV Shows', game: 'Games', movie: 'Movies', boardgame: 'Board', steamHours: 'Steam hours', animeHours: 'Anime hours', mangaChapters: 'Manga chapters', avgRating: 'Average rating', dna: 'Profile DNA', footprint: 'Media footprint', caption: 'Distribution, hours, and dominant genres in the library.', titles: 'titles', rated: 'rated', rating: 'rating' }
  const stats = useMemo(() => {
    const byType = (t: string) => mediaList.filter(m => normalizeType(m.type) === t)
    const steamHours = byType('game').filter(m => m.is_steam).reduce((s, m) => s + (m.current_episode || 0), 0)
    const animeEps = byType('anime').reduce((s, m) => s + (m.current_episode || 0), 0)
    const mangaChapters = byType('manga').reduce((s, m) => s + (m.current_episode || 0), 0)
    const rated = mediaList.filter(m => m.rating && m.rating > 0)
    const avgRating = rated.length > 0
      ? (rated.reduce((s, m) => s + (m.rating || 0), 0) / rated.length).toFixed(1)
      : null
    const genreCount: Record<string, number> = {}
    for (const item of mediaList) {
      for (const g of (item.genres || [])) {
        if (!g) continue
        genreCount[g] = (genreCount[g] || 0) + 1
      }
    }
    const topGenres = Object.entries(genreCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([g, count]) => ({ genre: g, count }))
    return {
      anime: byType('anime').length,
      tv: byType('tv').length,
      manga: byType('manga').length,
      games: byType('game').length,
      movies: byType('movie').length,
      boardgames: byType('boardgame').length,
      steamHours,
      animeHours: Math.round(animeEps * 24 / 60),
      mangaChapters,
      avgRating,
      topGenres,
      total: mediaList.length,
      ratedCount: rated.length,
    }
  }, [mediaList])

  const typeRows = [
    { key: 'anime',     value: stats.anime },
    { key: 'tv',        value: stats.tv },
    { key: 'manga',     value: stats.manga },
    { key: 'game',      value: stats.games },
    { key: 'movie',     value: stats.movies },
    { key: 'boardgame', value: stats.boardgames },
  ]

  const metrics = [
    stats.steamHours > 0  && { icon: <Gamepad2 size={13} />, label: copy.steamHours,  value: `${stats.steamHours}h` },
    stats.animeHours > 0  && { icon: <Clock size={13} />,    label: copy.animeHours,  value: `~${stats.animeHours}h` },
    stats.mangaChapters > 0 && { icon: <Layers size={13} />, label: copy.mangaChapters, value: `${stats.mangaChapters}` },
    stats.avgRating       && { icon: <Star size={13} />,      label: copy.avgRating, value: stats.avgRating },
  ].filter(Boolean) as { icon: React.ReactElement; label: string; value: string }[]

  if (stats.total === 0) return null

  return (
    <div className="mb-8 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.16)] bg-[linear-gradient(160deg,rgba(230,255,61,0.06),var(--bg-secondary))] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.20)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 gk-section-eyebrow">
            <Sparkles size={12} />
            {copy.dna}
          </div>
          <p className="gk-title text-[var(--text-primary)]">{copy.footprint}</p>
          <p className="gk-caption">{copy.caption}</p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <ProfileDNAStat label={copy.titles} value={stats.total} accent />
        <ProfileDNAStat label={copy.rated} value={stats.ratedCount} />
        <ProfileDNAStat label={copy.rating} value={stats.avgRating || '—'} />
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
        {typeRows.map(({ key, value }) => {
          const cfg = { ...TYPE_CONFIG[key], label: key === 'tv' ? copy.tv : key === 'game' ? copy.game : key === 'movie' ? copy.movie : key === 'boardgame' ? copy.boardgame : TYPE_CONFIG[key].label }
          const Icon = cfg.icon
          const isEmpty = value === 0
          return (
            <div
              key={key}
              className="rounded-2xl border border-[var(--border-subtle)] bg-black/16 p-3 text-center ring-1 ring-white/5"
              style={!isEmpty ? { background: cfg.bg, borderColor: `color-mix(in srgb, ${cfg.color} 24%, transparent)` } : undefined}
            >
              <Icon size={15} className="mx-auto mb-1.5" style={{ color: isEmpty ? 'var(--text-muted)' : cfg.color }} />
              <p className={`font-mono-data text-[18px] font-black leading-none ${isEmpty ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
              <p className="gk-label mt-1 truncate">{cfg.label}</p>
            </div>
          )
        })}
      </div>

      {metrics.length > 0 && (
        <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 4)}, minmax(0, 1fr))` }}>
          {metrics.map((m, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border-subtle)] bg-black/18 px-3 py-3 text-center ring-1 ring-white/5">
              <p className="font-mono-data text-base font-black text-[var(--text-primary)]">{m.value}</p>
              <div className="mt-1 flex items-center justify-center gap-1 text-[var(--text-muted)]">
                {m.icon}
                <span className="gk-label">{m.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {stats.topGenres.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 border-t border-white/5 pt-4">
          {stats.topGenres.map(({ genre, count }) => (
            <span
              key={genre}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-bold"
              style={{ background: 'rgba(230,255,61,0.06)', borderColor: 'rgba(230,255,61,0.2)', color: 'rgba(230,255,61,0.85)' }}
            >
              {genre}
              <span className="font-mono-data text-[10px] opacity-60">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}