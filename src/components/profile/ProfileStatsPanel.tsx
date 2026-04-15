'use client'
// src/components/profile/ProfileStatsPanel.tsx
// Instagram-style: compact horizontal stats bar + genre chips

import { useMemo } from 'react'
import { Star } from 'lucide-react'

type UserMedia = {
  id: string
  type: string
  is_steam?: boolean
  appid?: string
  current_episode: number
  rating?: number
  genres?: string[]
}

export function ProfileStatsPanel({ mediaList }: { mediaList: UserMedia[] }) {
  const stats = useMemo(() => {
    const byType = (t: string) => mediaList.filter(m => m.type === t)
    const steamHours = byType('game').filter(m => m.is_steam).reduce((s, m) => s + (m.current_episode || 0), 0)
    const animeEps = byType('anime').reduce((s, m) => s + (m.current_episode || 0), 0)
    const mangaChapters = byType('manga').reduce((s, m) => s + (m.current_episode || 0), 0)
    const rated = mediaList.filter(m => m.rating && m.rating > 0)
    const avgRating = rated.length > 0
      ? (rated.reduce((s, m) => s + (m.rating || 0), 0) / rated.length).toFixed(1)
      : null
    const genreCount: Record<string, number> = {}
    for (const item of mediaList) for (const g of (item.genres || [])) genreCount[g] = (genreCount[g] || 0) + 1
    const topGenres = Object.entries(genreCount).sort(([, a], [, b]) => b - a).slice(0, 5).map(([g]) => g)
    return {
      anime: byType('anime').length, tv: byType('tv').length, manga: byType('manga').length,
      games: byType('game').length, movies: byType('movie').length, boards: byType('boardgame').length,
      steamHours, animeHours: Math.round(animeEps * 24 / 60), mangaChapters,
      avgRating, topGenres, total: mediaList.length,
    }
  }, [mediaList])

  const typeStats = [
    { label: 'Anime', value: stats.anime },
    { label: 'Serie', value: stats.tv },
    { label: 'Manga', value: stats.manga },
    { label: 'Giochi', value: stats.games },
    { label: 'Film', value: stats.movies },
    { label: 'Board', value: stats.boards },
  ].filter(s => s.value > 0)

  return (
    <div className="mb-8">
      {/* Type counts — Instagram-like horizontal row */}
      {typeStats.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-[var(--border)] rounded-2xl overflow-hidden mb-4">
          {typeStats.map(s => (
            <div key={s.label} className="bg-[var(--bg-primary)] text-center py-3 px-2">
              <p className="text-[17px] font-semibold text-[var(--text-primary)] leading-tight">{s.value}</p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick metrics — compact, no border cards */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide px-0.5 pb-1">
        {stats.steamHours > 0 && (
          <div className="flex-shrink-0 text-center">
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">{stats.steamHours}h</p>
            <p className="text-[11px] text-[var(--text-muted)]">Steam</p>
          </div>
        )}
        {stats.animeHours > 0 && (
          <div className="flex-shrink-0 text-center">
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">~{stats.animeHours}h</p>
            <p className="text-[11px] text-[var(--text-muted)]">Anime</p>
          </div>
        )}
        {stats.mangaChapters > 0 && (
          <div className="flex-shrink-0 text-center">
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">{stats.mangaChapters}</p>
            <p className="text-[11px] text-[var(--text-muted)]">Cap. manga</p>
          </div>
        )}
        {stats.avgRating && (
          <div className="flex-shrink-0 text-center">
            <p className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-0.5 justify-center">
              <Star size={12} fill="currentColor" />
              {stats.avgRating}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">Media voti</p>
          </div>
        )}
      </div>

      {/* Top genres — small pills */}
      {stats.topGenres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {stats.topGenres.map(g => (
            <span
              key={g}
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                border: '0.5px solid var(--border)',
              }}
            >
              {g}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}