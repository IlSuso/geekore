'use client'
// src/components/profile/ProfileStatsPanel.tsx
// Layout pulito e simmetrico: griglia tipi media + metriche + generi

import { useMemo } from 'react'
import { Star, Clock, BookOpen, Tv, Layers } from 'lucide-react'

type UserMedia = {
  id: string
  type: string
  is_steam?: boolean
  current_episode: number
  rating?: number
  genres?: string[]
}

const TYPE_CONFIG: Record<string, { label: string; color: string; accent: string }> = {
  anime:     { label: 'Anime',    color: 'text-sky-400',    accent: 'bg-sky-500/10 border-sky-500/20' },
  tv:        { label: 'Serie TV', color: 'text-purple-400', accent: 'bg-purple-500/10 border-purple-500/20' },
  manga:     { label: 'Manga',    color: 'text-orange-400', accent: 'bg-orange-500/10 border-orange-500/20' },
  game:      { label: 'Giochi',   color: 'text-green-400',  accent: 'bg-green-500/10 border-green-500/20' },
  movie:     { label: 'Film',     color: 'text-red-400',    accent: 'bg-red-500/10 border-red-500/20' },
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
    for (const item of mediaList)
      for (const g of (item.genres || []))
        genreCount[g] = (genreCount[g] || 0) + 1
    const topGenres = Object.entries(genreCount)
      .sort(([, a], [, b]) => b - a).slice(0, 6).map(([g]) => g)
    return {
      anime: byType('anime').length, tv: byType('tv').length,
      manga: byType('manga').length, games: byType('game').length,
      movies: byType('movie').length,
      steamHours, animeHours: Math.round(animeEps * 24 / 60),
      mangaChapters, avgRating, topGenres, total: mediaList.length,
    }
  }, [mediaList])

  const typeRows = [
    { key: 'anime',     value: stats.anime },
    { key: 'tv',        value: stats.tv },
    { key: 'manga',     value: stats.manga },
    { key: 'game',      value: stats.games },
    { key: 'movie',     value: stats.movies },
  ] // tutti e 5 sempre visibili, anche a 0

  const metrics = [
    stats.steamHours > 0  && { icon: <Tv size={13} />,       label: 'Ore su Steam',  value: `${stats.steamHours}h` },
    stats.animeHours > 0  && { icon: <Clock size={13} />,    label: 'Ore di anime',  value: `~${stats.animeHours}h` },
    stats.mangaChapters > 0 && { icon: <Layers size={13} />, label: 'Cap. manga',  value: `${stats.mangaChapters}` },
    stats.avgRating       && { icon: <Star size={13} />,      label: 'Voto medio',   value: stats.avgRating },
  ].filter(Boolean) as { icon: JSX.Element; label: string; value: string }[]

  if (stats.total === 0) return null

  return (
    <div className="mb-8 space-y-4">

      {/* Griglia tipi media — sempre 6, 3×2 su mobile, 6×1 su desktop */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
        <div className="grid grid-cols-3 md:grid-cols-6">
          {typeRows.map(({ key, value }, i) => {
            const cfg = TYPE_CONFIG[key]
            const isEmpty = value === 0
            // bordi: destra sulle col 1 e 2 (0-indexed: 0 e 1), sotto sulla prima riga (0-2)
            const borderRight = (i % 3 !== 2) ? 'border-r border-zinc-800' : ''
            const borderBottom = (i < 3) ? 'border-b border-zinc-800 md:border-b-0' : ''
            const borderRightDesktop = (i < 5) ? 'md:border-r md:border-zinc-800' : ''
            return (
              <div key={key} className={`flex flex-col items-center justify-center py-4 px-2 gap-1 ${borderRight} ${borderBottom} ${borderRightDesktop}`}>
                <span className={`text-xl font-bold ${isEmpty ? 'text-zinc-700' : cfg.color}`}>
                  {value}
                </span>
                <span className={`text-[10px] font-medium uppercase tracking-wide ${isEmpty ? 'text-zinc-700' : 'text-zinc-500'}`}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Metriche ore/voti — row orizzontale divisa */}
      {metrics.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
          <div className={`grid grid-cols-${metrics.length} divide-x divide-zinc-800`}>
            {metrics.map((m, i) => (
              <div key={i} className="flex flex-col items-center justify-center py-4 px-3 gap-1.5">
                <span className="text-lg font-bold text-white">{m.value}</span>
                <div className="flex items-center gap-1 text-zinc-500">
                  {m.icon}
                  <span className="text-[10px] font-medium uppercase tracking-wide">{m.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generi — pill colorate, wrapped */}
      {stats.topGenres.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {stats.topGenres.map(g => (
            <span
              key={g}
              className="text-[11px] px-3 py-1.5 rounded-full font-medium border bg-violet-500/8 border-violet-500/20 text-violet-300"
            >
              {g}
            </span>
          ))}
        </div>
      )}

    </div>
  )
}