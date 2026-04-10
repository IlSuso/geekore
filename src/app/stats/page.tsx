'use client'
// src/app/stats/page.tsx
// Calcolatrice virale: "Quanto tempo ho sprecato?"
// Calcola le ore totali spese in anime, giochi, manga, film, serie.

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, Gamepad2, Film, BookOpen, Tv, Dices, Share2, RefreshCw } from 'lucide-react'
import Link from 'next/link'

// ─── Costanti di stima ────────────────────────────────────────────────────────
// Durate medie per unità di progresso
const AVG_ANIME_EP_MINUTES = 24
const AVG_MANGA_CHAPTER_MINUTES = 5
const AVG_MOVIE_MINUTES = 110
const AVG_TV_EP_MINUTES = 45
const AVG_BOARDGAME_SESSION_MINUTES = 75

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface MediaEntry {
  type: string
  current_episode: number
  is_steam?: boolean
  episodes?: number
  status?: string
}

interface Stats {
  animeHours: number
  animeEpisodes: number
  mangaHours: number
  mangaChapters: number
  gameHours: number
  movieHours: number
  movieCount: number
  tvHours: number
  tvEpisodes: number
  boardgameHours: number
  boardgameSessions: number
  totalMinutes: number
}

// ─── Helper formattazione ────────────────────────────────────────────────────

function formatDuration(minutes: number): { days: number; hours: number; minutes: number } {
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

// Quante vite di riferimento equivale il tempo
function getComparisons(totalMinutes: number) {
  const hours = totalMinutes / 60
  return [
    { label: 'Volte il Signore degli Anelli (trilogia estesa)', value: (hours / 11.4).toFixed(1), emoji: '💍' },
    { label: 'Partite complete a scacchi (avg 45 min)', value: Math.round(totalMinutes / 45).toLocaleString('it'), emoji: '♟️' },
    { label: 'Pizze che potresti aver mangiato (30 min a pizza)', value: Math.round(totalMinutes / 30).toLocaleString('it'), emoji: '🍕' },
    { label: 'Giri del mondo in aereo (20h di volo)', value: (hours / 20).toFixed(1), emoji: '✈️' },
    { label: 'Settimane di lavoro a tempo pieno', value: (hours / 40).toFixed(1), emoji: '💼' },
    { label: 'Giorni di vita', value: (hours / 24).toFixed(1), emoji: '📅' },
  ]
}

// ─── Componente bar ──────────────────────────────────────────────────────────

function StatBar({
  label, icon: Icon, hours, color, detail,
}: {
  label: string
  icon: React.ElementType
  hours: number
  color: string
  detail: string
}) {
  const pct = Math.min(hours, 100) // cappato a 100h per la barra visiva — non influenza il totale
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
          style={{ width: `${Math.min((pct / 500) * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Pagina ──────────────────────────────────────────────────────────────────

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
      const { data } = await supabase
        .from('user_media_entries')
        .select('type, current_episode, is_steam, episodes, status')
        .eq('user_id', user.id)
      setEntries(data || [])
      setLoading(false)
    }
    load()
  }, [])

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

    // Steam: current_episode contiene ore di gioco
    const gameHours = games.reduce((s, e) => s + (e.current_episode || 0), 0)
    const gameMinutes = gameHours * 60

    const boardSessions = boards.reduce((s, e) => s + (e.current_episode || 0), 0)
    const boardMinutes = boardSessions * AVG_BOARDGAME_SESSION_MINUTES

    const totalMinutes = animeMinutes + mangaMinutes + movieMinutes + tvMinutes + gameMinutes + boardMinutes

    return {
      animeHours: animeMinutes / 60,
      animeEpisodes,
      mangaHours: mangaMinutes / 60,
      mangaChapters,
      gameHours,
      movieHours: movieMinutes / 60,
      movieCount,
      tvHours: tvMinutes / 60,
      tvEpisodes,
      boardgameHours: boardMinutes / 60,
      boardgameSessions: boardSessions,
      totalMinutes,
    }
  }, [entries])

  const { days, hours, minutes } = formatDuration(stats.totalMinutes)
  const comparisons = getComparisons(stats.totalMinutes)

  const handleShare = async () => {
    const text = `Ho sprecato ${days} giorni, ${hours} ore e ${minutes} minuti in anime, giochi, film e manga su Geekore 😅 geekore.it`
    if (navigator.share) {
      await navigator.share({ text })
    } else {
      await navigator.clipboard.writeText(text)
      alert('Testo copiato! Incollalo dove vuoi.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw size={32} className="text-violet-400 animate-spin" />
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <Clock size={56} className="text-violet-400 mb-6" />
        <h1 className="text-3xl font-bold mb-3">Quanto tempo hai sprecato?</h1>
        <p className="text-zinc-400 mb-8">Accedi per scoprire quante ore della tua vita hai dedicato all'intrattenimento.</p>
        <Link href="/login" className="px-8 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition">
          Accedi per scoprirlo
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto px-6 pt-8">

        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-3">
            Quanto tempo{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
              hai sprecato?
            </span>
          </h1>
          <p className="text-zinc-400">Basato sulla tua collezione Geekore</p>
        </div>

        {/* Big number */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 mb-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 to-fuchsia-600/5 pointer-events-none" />
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4">Totale stimato</p>
          <div className="flex items-end justify-center gap-3 mb-2">
            {days > 0 && (
              <div className="text-center">
                <p className="text-5xl md:text-7xl font-black text-white">{days}</p>
                <p className="text-sm text-zinc-400 mt-1">giorni</p>
              </div>
            )}
            {hours > 0 && (
              <div className="text-center">
                <p className="text-5xl md:text-7xl font-black text-violet-400">{hours}</p>
                <p className="text-sm text-zinc-400 mt-1">ore</p>
              </div>
            )}
            {minutes > 0 && days === 0 && (
              <div className="text-center">
                <p className="text-5xl md:text-7xl font-black text-fuchsia-400">{minutes}</p>
                <p className="text-sm text-zinc-400 mt-1">minuti</p>
              </div>
            )}
          </div>
          <p className="text-zinc-600 text-sm mt-4">
            {Math.round(stats.totalMinutes / 60).toLocaleString('it')} ore totali
          </p>

          <button
            onClick={handleShare}
            className="mt-6 flex items-center gap-2 mx-auto px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-full text-sm font-medium transition"
          >
            <Share2 size={14} />
            Condividi
          </button>
        </div>

        {/* Breakdown */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 mb-8 space-y-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">Breakdown</h2>

          <StatBar
            label="Anime"
            icon={Film}
            hours={stats.animeHours}
            color="text-sky-400"
            detail={`${stats.animeEpisodes.toLocaleString('it')} episodi`}
          />
          <StatBar
            label="Videogiochi"
            icon={Gamepad2}
            hours={stats.gameHours}
            color="text-green-400"
            detail="ore Steam"
          />
          <StatBar
            label="Serie TV"
            icon={Tv}
            hours={stats.tvHours}
            color="text-purple-400"
            detail={`${stats.tvEpisodes.toLocaleString('it')} episodi`}
          />
          <StatBar
            label="Film"
            icon={Film}
            hours={stats.movieHours}
            color="text-red-400"
            detail={`${stats.movieCount} film`}
          />
          <StatBar
            label="Manga"
            icon={BookOpen}
            hours={stats.mangaHours}
            color="text-orange-400"
            detail={`${stats.mangaChapters.toLocaleString('it')} capitoli`}
          />
          <StatBar
            label="Board Game"
            icon={Dices}
            hours={stats.boardgameHours}
            color="text-yellow-400"
            detail={`${stats.boardgameSessions} partite`}
          />
        </div>

        {/* Comparazioni virali */}
        {stats.totalMinutes > 0 && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 mb-8">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-5">
              In questo tempo avresti potuto...
            </h2>
            <div className="space-y-4">
              {comparisons.map(c => (
                <div key={c.label} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{c.emoji}</span>
                    <span className="text-sm text-zinc-300">{c.label}</span>
                  </div>
                  <span className="text-sm font-bold text-violet-400 flex-shrink-0">{c.value}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note metodologia */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-xs text-zinc-600 leading-relaxed">
          <p className="font-semibold text-zinc-500 mb-1">Come calcoliamo?</p>
          Anime: {AVG_ANIME_EP_MINUTES}min/ep • Manga: {AVG_MANGA_CHAPTER_MINUTES}min/cap •
          Film: {AVG_MOVIE_MINUTES}min/film • Serie TV: {AVG_TV_EP_MINUTES}min/ep •
          Giochi: ore reali da Steam • Board game: {AVG_BOARDGAME_SESSION_MINUTES}min/partita.
          Le stime sono medie generali.
        </div>
      </div>
    </div>
  )
}