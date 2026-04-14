'use client'
// src/app/stats/page.tsx
// A2: Cache in-memory con TTL 5 minuti — evita fetch pesante ad ogni visita
// A2: useMemo per getComparisons (calcolo inline senza re-esecuzione)
// P5: SkeletonCard durante il caricamento

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, Gamepad2, Film, BookOpen, Tv, Dices, Share2, Gem, Globe, Briefcase, Calendar, Plane } from 'lucide-react'
import Link from 'next/link'

const AVG_ANIME_EP_MINUTES = 24
const AVG_MANGA_CHAPTER_MINUTES = 5
const AVG_MOVIE_MINUTES = 110
const AVG_TV_EP_MINUTES = 45
const AVG_BOARDGAME_SESSION_MINUTES = 75

interface MediaEntry {
  type: string
  current_episode: number
  is_steam?: boolean
  episodes?: number
  status?: string
}

interface Stats {
  animeHours: number; animeEpisodes: number
  mangaHours: number; mangaChapters: number
  gameHours: number
  movieHours: number; movieCount: number
  tvHours: number; tvEpisodes: number
  boardgameHours: number; boardgameSessions: number
  totalMinutes: number
}

// A2: Cache in-memory con TTL — chiave per userId
const statsCache = new Map<string, { entries: MediaEntry[]; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minuti

function formatDuration(minutes: number) {
  const totalHours = Math.floor(minutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const mins = Math.round(minutes % 60)
  return { days, hours, minutes: mins }
}

function formatReadable(minutes: number): string {
  const { days, hours, minutes: mins } = formatDuration(minutes)
  const parts = []
  if (days > 0) parts.push(`${days} giorni`)
  if (hours > 0) parts.push(`${hours} ore`)
  if (mins > 0 && days === 0) parts.push(`${mins} minuti`)
  return parts.join(', ') || '0 minuti'
}

function StatBar({ label, icon: Icon, hours, color, detail }: { label: string; icon: React.ElementType; hours: number; color: string; detail: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className={color} />
          <span className="text-sm font-medium text-white">{label}</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-white">{Math.round(hours)}h</span>
          <span className="text-xs text-zinc-500 ml-2">{detail}</span>
        </div>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${Math.min((hours / 500) * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

// P5: skeleton per stats
function StatsSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-4">
        <div className="h-8 bg-zinc-800 rounded-full w-48" />
        <div className="h-16 bg-zinc-800 rounded-2xl" />
        <div className="h-5 bg-zinc-800 rounded-full w-32" />
      </div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="space-y-2">
          <div className="flex justify-between">
            <div className="h-4 bg-zinc-800 rounded-full w-24" />
            <div className="h-4 bg-zinc-800 rounded-full w-16" />
          </div>
          <div className="h-2 bg-zinc-800 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export default function StatsPage() {
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setIsLoggedIn(true)

      // A2: controlla cache prima di fare fetch
      const cached = statsCache.get(user.id)
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        setEntries(cached.entries)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('user_media_entries')
        .select('type, current_episode, is_steam, episodes, status')
        .eq('user_id', user.id)

      const result = data || []
      // A2: salva in cache
      statsCache.set(user.id, { entries: result, ts: Date.now() })
      setEntries(result)
      setLoading(false)
    }
    load()
  }, [])

  // A2: useMemo per stats — non ricalcola ad ogni render
  const stats = useMemo<Stats>(() => {
    const anime = entries.filter(e => e.type === 'anime')
    const manga = entries.filter(e => e.type === 'manga')
    const movies = entries.filter(e => e.type === 'movie')
    const tv = entries.filter(e => e.type === 'tv')
    const games = entries.filter(e => e.type === 'game')
    const boards = entries.filter(e => e.type === 'boardgame')

    const animeEpisodes = anime.reduce((s, e) => s + (e.current_episode || 0), 0)
    const animeMinutes = animeEpisodes * AVG_ANIME_EP_MINUTES
    const mangaChapters = manga.reduce((s, e) => s + (e.current_episode || 0), 0)
    const mangaMinutes = mangaChapters * AVG_MANGA_CHAPTER_MINUTES
    const movieCount = movies.filter(e => e.status === 'completed' || (e.current_episode || 0) >= 1).length
    const movieMinutes = movieCount * AVG_MOVIE_MINUTES
    const tvEpisodes = tv.reduce((s, e) => s + (e.current_episode || 0), 0)
    const tvMinutes = tvEpisodes * AVG_TV_EP_MINUTES
    const gameHours = games.reduce((s, e) => s + (e.current_episode || 0), 0)
    const boardgameSessions = boards.reduce((s, e) => s + (e.current_episode || 0), 0)
    const boardgameMinutes = boardgameSessions * AVG_BOARDGAME_SESSION_MINUTES

    const totalMinutes = animeMinutes + mangaMinutes + movieMinutes + tvMinutes + (gameHours * 60) + boardgameMinutes

    return {
      animeHours: animeMinutes / 60, animeEpisodes,
      mangaHours: mangaMinutes / 60, mangaChapters,
      gameHours,
      movieHours: movieMinutes / 60, movieCount,
      tvHours: tvMinutes / 60, tvEpisodes,
      boardgameHours: boardgameMinutes / 60, boardgameSessions,
      totalMinutes,
    }
  }, [entries])

  // A2: useMemo per comparisons
  const comparisons = useMemo(() => {
    const hours = stats.totalMinutes / 60
    return [
      { label: 'Volte il Signore degli Anelli (trilogia estesa)', value: (hours / 11.4).toFixed(1), Icon: Gem },
      { label: 'Partite complete a scacchi (avg 45 min)', value: Math.round(stats.totalMinutes / 45).toLocaleString('it'), Icon: Dices },
      { label: 'Pizze che potresti aver mangiato (30 min a pizza)', value: Math.round(stats.totalMinutes / 30).toLocaleString('it'), Icon: Clock },
      { label: 'Giri del mondo in aereo (20h di volo)', value: (hours / 20).toFixed(1), Icon: Plane },
      { label: 'Settimane di lavoro a tempo pieno', value: (hours / 40).toFixed(1), Icon: Briefcase },
      { label: 'Giorni di vita', value: (hours / 24).toFixed(1), Icon: Calendar },
    ]
  }, [stats.totalMinutes])

  const { days, hours: remHours, minutes: remMins } = formatDuration(stats.totalMinutes)

  if (!isLoggedIn && !loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white text-center px-6">
        <div>
          <Clock size={48} className="mx-auto mb-4 text-violet-400 opacity-50" />
          <p className="text-xl font-semibold mb-2">Accedi per vedere le tue statistiche</p>
          <p className="text-zinc-500 mb-6">Traccia la tua collezione e scopri quanto tempo hai "sprecato"</p>
          <Link href="/login" className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition-all">Accedi</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 pt-4 md:pt-8">
        <div className="mb-8">
          <h1 className="text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
            Tempo sprecato
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Quanto della tua vita hai dedicato ai media?</p>
        </div>

        {loading ? <StatsSkeleton /> : (
          <>
            {/* Totale */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 mb-8 text-center">
              <p className="text-zinc-500 text-sm mb-3 uppercase tracking-widest font-medium">Totale stimato</p>
              <div className="flex items-end justify-center gap-4 mb-4">
                {days > 0 && (
                  <div>
                    <p className="text-6xl font-black tracking-tighter text-white">{days}</p>
                    <p className="text-zinc-500 text-sm">giorni</p>
                  </div>
                )}
                {remHours > 0 && (
                  <div>
                    <p className="text-6xl font-black tracking-tighter text-violet-400">{remHours}</p>
                    <p className="text-zinc-500 text-sm">ore</p>
                  </div>
                )}
                {remMins > 0 && days === 0 && (
                  <div>
                    <p className="text-6xl font-black tracking-tighter text-fuchsia-400">{remMins}</p>
                    <p className="text-zinc-500 text-sm">minuti</p>
                  </div>
                )}
                {stats.totalMinutes === 0 && (
                  <p className="text-4xl font-black text-zinc-600">0 minuti</p>
                )}
              </div>
              <p className="text-zinc-600 text-xs">{formatReadable(stats.totalMinutes)}</p>
            </div>

            {/* Barre per categoria */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8 space-y-5">
              {stats.animeHours > 0 && <StatBar label="Anime" icon={Tv} hours={stats.animeHours} color="text-sky-400" detail={`${stats.animeEpisodes} ep`} />}
              {stats.gameHours > 0 && <StatBar label="Videogiochi" icon={Gamepad2} hours={stats.gameHours} color="text-green-400" detail="ore Steam" />}
              {stats.tvHours > 0 && <StatBar label="Serie TV" icon={Tv} hours={stats.tvHours} color="text-purple-400" detail={`${stats.tvEpisodes} ep`} />}
              {stats.movieHours > 0 && <StatBar label="Film" icon={Film} hours={stats.movieHours} color="text-red-400" detail={`${stats.movieCount} film`} />}
              {stats.mangaHours > 0 && <StatBar label="Manga" icon={BookOpen} hours={stats.mangaHours} color="text-orange-400" detail={`${stats.mangaChapters} cap`} />}
              {stats.boardgameHours > 0 && <StatBar label="Board Game" icon={Dices} hours={stats.boardgameHours} color="text-yellow-400" detail={`${stats.boardgameSessions} sessioni`} />}
              {stats.totalMinutes === 0 && (
                <p className="text-zinc-600 text-center py-4">Aggiungi media alla tua collezione per vedere le statistiche</p>
              )}
            </div>

            {/* Comparisons */}
            {stats.totalMinutes > 0 && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-3">
                <p className="text-sm font-semibold text-zinc-400 mb-4">Equivale a…</p>
                {comparisons.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <c.Icon size={18} className="text-zinc-500 flex-shrink-0" />
                      <span className="text-xs text-zinc-400">{c.label}</span>
                    </div>
                    <span className="text-sm font-bold text-white tabular-nums flex-shrink-0">{c.value}×</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}