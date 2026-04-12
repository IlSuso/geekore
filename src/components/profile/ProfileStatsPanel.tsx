'use client'
// src/components/profile/ProfileStatsPanel.tsx
// 7.4 — estratto da profile/[username]/page.tsx

import { useMemo } from 'react'

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

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 mb-10">
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">Statistiche</h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Anime', value: stats.anime, color: 'text-sky-400' },
          { label: 'Serie TV', value: stats.tv, color: 'text-purple-400' },
          { label: 'Manga', value: stats.manga, color: 'text-orange-400' },
          { label: 'Giochi', value: stats.games, color: 'text-green-400' },
          { label: 'Film', value: stats.movies, color: 'text-red-400' },
          { label: 'Board', value: stats.boards, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-violet-400">{stats.steamHours}h</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Ore Steam</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-sky-400">~{stats.animeHours}h</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Ore anime</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-orange-400">{stats.mangaChapters}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Cap. manga</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-yellow-400">{stats.avgRating ? `★ ${stats.avgRating}` : '—'}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Voto medio</p>
        </div>
      </div>
      {stats.topGenres.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Generi più seguiti</p>
          <div className="flex flex-wrap gap-1.5">
            {stats.topGenres.map(g => (
              <span key={g} className="text-[10px] bg-violet-500/15 text-violet-300 px-2.5 py-1 rounded-full font-medium border border-violet-500/20">{g}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
