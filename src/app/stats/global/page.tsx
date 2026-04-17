// DESTINAZIONE: src/app/stats/global/page.tsx
// #38: Pagina statistiche globali della community Geekore.
// Server Component — dati aggregati letti da Supabase.

import { createClient } from '@/lib/supabase/server'
import { Users, Clock, Star, Gamepad2, Tv, Film, BookOpen, TrendingUp, Globe, Trophy, Dices } from 'lucide-react'
import Link from 'next/link'

async function getGlobalStats() {
  const supabase = await createClient()

  const [
    { count: totalUsers },
    { data: mediaAgg },
    { data: topTitles },
    { data: topGenres },
    { count: totalPosts },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),

    supabase
      .from('user_media_entries')
      .select('type, current_episode, is_steam, status'),

    supabase
      .from('user_media_entries')
      .select('title, type, cover_image, external_id')
      .not('title', 'is', null)
      .limit(500),

    supabase
      .from('user_media_entries')
      .select('genres')
      .not('genres', 'is', null),

    supabase.from('posts').select('id', { count: 'exact', head: true }),
  ])

  // Aggregazione ore per tipo
  const entries = mediaAgg || []
  let animeEps = 0, mangaChapters = 0, gameHours = 0, movieCount = 0, tvEps = 0, boardgameCount = 0
  let totalEntries = 0

  for (const e of entries) {
    totalEntries++
    const ep = e.current_episode || 0
    if (e.type === 'anime') animeEps += ep
    else if (e.type === 'manga') mangaChapters += ep
    else if (e.type === 'game' && e.is_steam) gameHours += ep
    else if (e.type === 'movie' && e.status === 'completed') movieCount++
    else if (e.type === 'tv') tvEps += ep
    else if (e.type === 'boardgame') boardgameCount++
  }

  const animeHours = Math.round(animeEps * 24 / 60)
  const mangaHours = Math.round(mangaChapters * 5 / 60)
  const movieHours = Math.round(movieCount * 1.8)
  const tvHours = Math.round(tvEps * 45 / 60)
  const boardgameHours = Math.round(boardgameCount * 1.5)
  const totalHours = animeHours + mangaHours + gameHours + movieHours + tvHours + boardgameHours

  // Titoli più popolari
  const titleMap = new Map<string, { count: number; item: any }>()
  for (const row of topTitles || []) {
    if (!row.title) continue
    const key = `${row.type}::${row.title}`
    if (!titleMap.has(key)) titleMap.set(key, { count: 0, item: row })
    titleMap.get(key)!.count++
  }
  const popularTitles = [...titleMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Generi più popolari
  const genreMap = new Map<string, number>()
  for (const row of topGenres || []) {
    if (!Array.isArray(row.genres)) continue
    for (const g of row.genres) {
      if (g) genreMap.set(g, (genreMap.get(g) || 0) + 1)
    }
  }
  const popularGenres = [...genreMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)

    return {
    totalUsers: totalUsers || 0,
    totalEntries,
    totalPosts: totalPosts || 0,
    totalHours,
    animeHours,
    mangaHours,
    gameHours,
    movieHours,
    tvHours,
    boardgameHours,
    animeEps,
    mangaChapters,
    movieCount,
    tvEps,
    boardgameCount,
    popularTitles,
    popularGenres,
  }
}

const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500', boardgame: 'bg-yellow-500',
}
const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco', tv: 'Serie TV', movie: 'Film', boardgame: 'Board Game',
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-2">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="text-2xl font-black text-white mt-1">{value}</p>
      <p className="text-sm text-zinc-400 leading-snug">{label}</p>
      {sub && <p className="text-xs text-zinc-600">{sub}</p>}
    </div>
  )
}

export default async function GlobalStatsPage() {
  const stats = await getGlobalStats()

  const formatNumber = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` :
    n.toLocaleString('it')

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-screen-2xl mx-auto px-4 pt-8">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
              <Globe size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter">Statistiche globali</h1>
              <p className="text-zinc-500 text-sm">La community Geekore in numeri</p>
            </div>
          </div>
          <Link href="/stats" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
            ← Le mie statistiche personali
          </Link>
        </div>

        {/* Big stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
          <StatCard label="Utenti registrati" value={formatNumber(stats.totalUsers)} icon={Users} color="bg-violet-600" />
          <StatCard label="Titoli in collezione" value={formatNumber(stats.totalEntries)} icon={TrendingUp} color="bg-fuchsia-600" />
          <StatCard label="Ore di contenuto" value={formatNumber(stats.totalHours)} sub="stima aggregata" icon={Clock} color="bg-emerald-600" />
          <StatCard label="Ep. anime guardati" value={formatNumber(stats.animeEps)} sub={`≈ ${formatNumber(stats.animeHours)} ore`} icon={Tv} color="bg-sky-600" />
          <StatCard label="Ore Steam" value={formatNumber(stats.gameHours)} icon={Gamepad2} color="bg-green-600" />
          <StatCard label="Film visti" value={formatNumber(stats.movieCount)} icon={Film} color="bg-red-600" />
          <StatCard label="Board game in collezione" value={formatNumber(stats.boardgameCount)} sub={`≈ ${formatNumber(stats.boardgameHours)} ore stimate`} icon={Dices} color="bg-yellow-600" />
        </div>

        {/* Ore per tipo */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-5">Ore per categoria</h2>
          {(() => {
            const maxH = Math.max(stats.animeHours, stats.gameHours, stats.tvHours, stats.movieHours, stats.mangaHours, stats.boardgameHours) || 1
            return [
              { label: 'Anime', hours: stats.animeHours, color: 'bg-sky-500' },
              { label: 'Videogiochi (Steam)', hours: stats.gameHours, color: 'bg-green-500' },
              { label: 'Serie TV', hours: stats.tvHours, color: 'bg-purple-500' },
              { label: 'Film', hours: stats.movieHours, color: 'bg-red-500' },
              { label: 'Manga', hours: stats.mangaHours, color: 'bg-orange-500' },
              { label: 'Board Game', hours: stats.boardgameHours, color: 'bg-yellow-500' },
            ].map(({ label, hours, color }) => ({ label, hours, color, max: maxH }))
          })().map(({ label, hours, color, max }) => (
            <div key={label} className="mb-4 last:mb-0">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-300">{label}</span>
                <span className="font-bold text-white">{formatNumber(hours)}h</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${color} transition-all duration-700`}
                  style={{ width: max > 0 ? `${(hours / max) * 100}%` : '0%' }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Titoli più popolari */}
        {stats.popularTitles.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Star size={14} className="text-yellow-400" />
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Più aggiunti di sempre</h2>
            </div>
            <div className="space-y-2">
              {stats.popularTitles.map((t, i) => (
                <div key={`${t.item.type}-${t.item.title}`} className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
                  <div className="w-6 text-center flex-shrink-0">
                    {i < 3
                      ? <Trophy size={14} className={i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : 'text-amber-600'} />
                      : <span className="text-xs font-bold text-zinc-600">#{i+1}</span>
                    }
                  </div>
                  <div className="w-10 h-14 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0">
                    {t.item.cover_image
                      ? <img src={t.item.cover_image} alt={t.item.title} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-zinc-600"><Tv size={20} /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.item.title}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${TYPE_COLOR[t.item.type] || 'bg-zinc-600'}`}>
                      {TYPE_LABEL[t.item.type] || t.item.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400 flex-shrink-0">
                    <Users size={11} />
                    <span className="text-xs font-bold">{t.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generi più popolari */}
        {stats.popularGenres.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={14} className="text-violet-400" />
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Generi più amati</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.popularGenres.map(([genre, count]) => (
                <div key={genre} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full">
                  <span className="text-sm font-medium text-zinc-200">{genre}</span>
                  <span className="text-xs text-violet-400 font-bold">{formatNumber(count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-zinc-700 text-xs">
          Statistiche aggiornate in tempo reale · {stats.totalPosts.toLocaleString('it')} post pubblicati dalla community
        </p>
      </div>
    </div>
  )
}