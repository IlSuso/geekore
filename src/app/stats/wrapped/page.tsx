'use client'
// src/app/stats/wrapped/page.tsx
// N2: Wrapped annuale stile Spotify
// Slides verticali fullscreen animate con View Transitions API
// Card 9:16 condivisibile come immagine via canvas

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronDown, Share2, X, Download, Tv, Gamepad2, Film, Trophy, Gem, Layers } from 'lucide-react'
import { useLocale } from '@/lib/locale'

type WrappedCopy = {
  ranks: { legend: string; expert: string; passionate: string; novice: string }
  hello: string
  tapToDiscover: string
  totalTime: string
  hours: string
  wholeDays: (days: number) => string
  differentTitles: (count: number) => string
  yourNumbers: string
  animeEpisodes: string
  gameHours: string
  mangaChapters: string
  moviesWatched: string
  tvEpisodes: string
  favoriteGenre: string
  varied: string
  favoriteGenreHint: string
  yourRank: string
  totalHours: string
  titles: string
  topGenre: string
  shareWrapped: string
  loading: (year: number) => string
  shareText: (year: number, rank: string, hours: number, count: number) => string
  shareTitle: (year: number) => string
}

function getWrappedCopy(locale: 'it' | 'en'): WrappedCopy {
  return locale === 'en' ? {
    ranks: { legend: 'Legend', expert: 'Expert', passionate: 'Enthusiast', novice: 'Novice' },
    hello: 'Hi', tapToDiscover: 'Tap to discover your year', totalTime: 'Total time', hours: 'hours',
    wholeDays: (days) => `That is ${days} full days`, differentTitles: (count) => `Across ${count} different titles`,
    yourNumbers: 'Your numbers', animeEpisodes: 'Anime episodes', gameHours: 'Game hours', mangaChapters: 'Manga chapters read', moviesWatched: 'Movies watched', tvEpisodes: 'TV episodes',
    favoriteGenre: 'Your favorite genre', varied: 'Varied', favoriteGenreHint: 'The genre you loved the most this year',
    yourRank: 'Your rank', totalHours: 'Total hours', titles: 'Titles', topGenre: 'Top genre', shareWrapped: 'Share your Wrapped',
    loading: (year) => `Building your ${year} Wrapped…`,
    shareText: (year, rank, hours, count) => `My ${year} Wrapped on Geekore!\n[${rank}] ${hours}h • ${count} titles\ngeekore.it`,
    shareTitle: (year) => `Geekore Wrapped ${year}`
  } : {
    ranks: { legend: 'Leggenda', expert: 'Esperto', passionate: 'Appassionato', novice: 'Novizio' },
    hello: 'Ciao', tapToDiscover: 'Tocca per scoprire il tuo anno', totalTime: 'Tempo totale', hours: 'ore',
    wholeDays: (days) => `Ovvero ${days} giorni interi`, differentTitles: (count) => `Su ${count} titoli diversi`,
    yourNumbers: 'I tuoi numeri', animeEpisodes: 'Episodi anime', gameHours: 'Ore di gioco', mangaChapters: 'Cap. manga letti', moviesWatched: 'Film guardati', tvEpisodes: 'Ep. serie TV',
    favoriteGenre: 'Il tuo genere preferito', varied: 'Vario', favoriteGenreHint: `Il genere che hai più amato quest'anno`,
    yourRank: 'Il tuo rango', totalHours: 'Ore totali', titles: 'Titoli', topGenre: 'Genere top', shareWrapped: 'Condividi il tuo Wrapped',
    loading: (year) => `Costruendo il tuo ${year} Wrapped…`,
    shareText: (year, rank, hours, count) => `Il mio ${year} Wrapped su Geekore!\n[${rank}] ${hours}h • ${count} titoli\ngeekore.it`,
    shareTitle: (year) => `Geekore Wrapped ${year}`
  }
}

interface WrappedData {
  username: string
  displayName: string
  year: number
  totalHours: number
  totalDays: number
  animeEpisodes: number
  mangaChapters: number
  gameHours: number
  movieCount: number
  tvEpisodes: number
  topGenre: string
  mediaCount: number
  rank: string
  rankEmoji: string
}

// ── Calcoli ────────────────────────────────────────────────────────────────────

const AVG_ANIME_EP_MIN = 24
const AVG_MANGA_CH_MIN = 5
const AVG_MOVIE_MIN = 110
const AVG_TV_EP_MIN = 45

function calcRank(totalHours: number, copy: WrappedCopy): { rank: string; rankEmoji: string } {
  if (totalHours >= 2000) return { rank: copy.ranks.legend, rankEmoji: 'gem' }
  if (totalHours >= 500)  return { rank: copy.ranks.expert,  rankEmoji: 'gold' }
  if (totalHours >= 100)  return { rank: copy.ranks.passionate, rankEmoji: 'silver' }
  return { rank: copy.ranks.novice, rankEmoji: 'bronze' }
}

// ── Slides ─────────────────────────────────────────────────────────────────────

function Slide1({ data, onNext, copy }: { data: WrappedData; onNext: () => void; copy: WrappedCopy }) {
  return (
    <div
      onClick={onNext}
      className="h-full flex flex-col items-center justify-center text-center px-8 cursor-pointer select-none"
      style={{ background: 'linear-gradient(160deg, #1a0a2e 0%, #0d0a1a 50%, #0a1a2e 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-[80px]" style={{ background: "rgba(230,255,61,0.08)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full blur-[60px]" style={{ background: 'rgba(230,255,61,0.06)' }} />
      </div>
      <div className="relative z-10">
        <p className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: 'var(--accent)' }}>Geekore</p>
        <h1 className="text-6xl font-black tracking-tighter mb-2 text-white">{data.year}</h1>
        <h2 className="text-3xl font-black tracking-tight mb-6">
          <span style={{ color: 'var(--accent)' }}>
            Wrapped
          </span>
        </h2>
        <p className="text-zinc-400 text-lg">{copy.hello}, <strong className="text-white">{data.displayName}</strong></p>
        <p className="text-zinc-500 text-sm mt-2">{copy.tapToDiscover}</p>
      </div>
      <ChevronDown size={24} className="absolute bottom-8 text-zinc-600 animate-bounce" />
    </div>
  )
}

function Slide2({ data, onNext, copy, locale }: { data: WrappedData; onNext: () => void; copy: WrappedCopy; locale: 'it' | 'en' }) {
  const [displayed, setDisplayed] = useState(0)
  useEffect(() => {
    let start: number | null = null
    const raf = (t: number) => {
      if (!start) start = t
      const p = Math.min((t - start) / 1500, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayed(Math.round(eased * data.totalHours))
      if (p < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
  }, [data.totalHours])

  return (
    <div
      onClick={onNext}
      className="h-full flex flex-col items-center justify-center text-center px-8 cursor-pointer select-none"
      style={{ background: 'linear-gradient(160deg, #0a1a2e 0%, #0d0a1a 100%)' }}
    >
      <p className="text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-6">{copy.totalTime}</p>
      <p className="text-[80px] sm:text-[100px] font-black leading-none tabular-nums text-white mb-2">
        {displayed.toLocaleString(locale)}
      </p>
      <p className="text-3xl font-bold text-cyan-400 mb-6">{copy.hours}</p>
      <p className="text-zinc-400 text-lg">
        {copy.wholeDays(data.totalDays)}
      </p>
      <p className="text-zinc-600 text-sm mt-3">
        {copy.differentTitles(data.mediaCount)}
      </p>
    </div>
  )
}

function Slide3({ data, onNext, copy, locale }: { data: WrappedData; onNext: () => void; copy: WrappedCopy; locale: 'it' | 'en' }) {
  const stats = [
    { Icon: Tv,       label: copy.animeEpisodes,         value: data.animeEpisodes,  color: 'var(--type-anime)' },
    { Icon: Gamepad2, label: copy.gameHours,          value: data.gameHours,      color: 'var(--type-game)' },
    { Icon: Layers,   label: copy.mangaChapters,      value: data.mangaChapters,  color: 'var(--type-manga)' },
    { Icon: Film,     label: copy.moviesWatched,         value: data.movieCount,     color: 'var(--type-movie)' },
    { Icon: Tv,       label: copy.tvEpisodes,          value: data.tvEpisodes,     color: 'var(--type-tv)' },
  ].filter(s => s.value > 0)

  return (
    <div
      onClick={onNext}
      className="h-full flex flex-col justify-center px-8 cursor-pointer select-none"
      style={{ background: 'linear-gradient(160deg, #1a0a0e 0%, #0d0a1a 100%)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest mb-8 text-center" style={{ color: 'var(--accent)' }}>{copy.yourNumbers}</p>
      <div className="space-y-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="flex items-center gap-4 bg-white/5 rounded-2xl px-5 py-4 border border-white/10"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <s.Icon size={28} style={{ color: s.color }} />
            <div className="flex-1">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className="text-2xl font-black tabular-nums" style={{ color: s.color }}>
                {s.value.toLocaleString(locale)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide4({ data, onNext, copy }: { data: WrappedData; onNext: () => void; copy: WrappedCopy }) {
  return (
    <div
      onClick={onNext}
      className="h-full flex flex-col items-center justify-center text-center px-8 cursor-pointer select-none"
      style={{ background: 'linear-gradient(160deg, #0a1a0e 0%, #0d0a1a 100%)' }}
    >
      <p className="text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-6">{copy.favoriteGenre}</p>
      <p className="text-5xl font-black text-white mb-4">{data.topGenre || copy.varied}</p>
      <div className="w-16 h-1 bg-emerald-400 rounded-full mb-6" />
      <p className="text-zinc-400">{copy.favoriteGenreHint}</p>
    </div>
  )
}

function Slide5({ data, onShare, copy, locale }: { data: WrappedData; onShare: () => void; copy: WrappedCopy; locale: 'it' | 'en' }) {
  const { rank, rankEmoji } = calcRank(data.totalHours, copy)

  return (
    <div
      className="h-full flex flex-col items-center justify-center text-center px-8 select-none"
      style={{ background: 'linear-gradient(160deg, #1a0a2e 0%, #0d0a1a 50%, #1a0a0e 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-80 h-80 rounded-full blur-[100px]" style={{ background: "rgba(230,255,61,0.06)" }} />
      </div>
      <div className="relative z-10 w-full">
        <p className="text-4xl mb-4">{rankEmoji}</p>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>{copy.yourRank}</p>
        <p className="text-5xl font-black text-white mb-8">{rank}</p>
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 text-sm">{copy.totalHours}</span>
            <span className="text-white font-bold">{data.totalHours.toLocaleString(locale)}h</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 text-sm">{copy.titles}</span>
            <span className="text-white font-bold">{data.mediaCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 text-sm">{copy.topGenre}</span>
            <span className="font-bold" style={{ color: 'var(--accent)' }}>{data.topGenre || copy.varied}</span>
          </div>
        </div>
        <button
          onClick={onShare}
          className="flex items-center gap-2 mx-auto px-8 py-4 rounded-2xl font-bold text-sm transition-all"
          style={{ background: 'var(--accent)', color: '#0B0B0F' }}
        >
          <Share2 size={16} />
          {copy.shareWrapped}
        </button>
      </div>
    </div>
  )
}

// ── Pagina principale ──────────────────────────────────────────────────────────

export default function WrappedPage() {
  const { locale } = useLocale()
  const copy = useMemo(() => getWrappedCopy(locale), [locale])
  const [data, setData] = useState<WrappedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [slide, setSlide] = useState(0)
  const router = useRouter()
  const supabase = createClient()
  const year = new Date().getFullYear()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: profile }, { data: entries }] = await Promise.all([
        supabase.from('profiles').select('username, display_name').eq('id', user.id).single(),
        supabase.from('user_media_entries')
          .select('type, current_episode, is_steam, genres, status')
          .eq('user_id', user.id)
          .gte('created_at', `${year}-01-01`),
      ])

      const es = entries || []
      const animeEps = es.filter(e => e.type === 'anime').reduce((s, e) => s + (e.current_episode || 0), 0)
      const mangaChaps = es.filter(e => e.type === 'manga').reduce((s, e) => s + (e.current_episode || 0), 0)
      const gameH = es.filter(e => e.type === 'game').reduce((s, e) => s + (e.current_episode || 0), 0)
      const movieC = es.filter(e => e.type === 'movie' && e.status === 'completed').length
      const tvEps = es.filter(e => e.type === 'tv').reduce((s, e) => s + (e.current_episode || 0), 0)

      const totalMin = animeEps * AVG_ANIME_EP_MIN + mangaChaps * AVG_MANGA_CH_MIN +
        gameH * 60 + movieC * AVG_MOVIE_MIN + tvEps * AVG_TV_EP_MIN
      const totalHours = Math.round(totalMin / 60)
      const totalDays = Math.round(totalHours / 24)

      // Genere più frequente
      const genreCounts: Record<string, number> = {}
      for (const e of es) {
        for (const g of (e.genres || [])) {
          if (g) genreCounts[g] = (genreCounts[g] || 0) + 1
        }
      }
      const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
      const { rank, rankEmoji } = calcRank(totalHours, copy)

      setData({
        username: profile?.username || '',
        displayName: profile?.display_name || profile?.username || 'Geek',
        year,
        totalHours,
        totalDays,
        animeEpisodes: animeEps,
        mangaChapters: mangaChaps,
        gameHours: gameH,
        movieCount: movieC,
        tvEpisodes: tvEps,
        topGenre,
        mediaCount: es.length,
        rank,
        rankEmoji,
      })
      setLoading(false)
    }
    load()
  }, [copy, router, year])

  const handleShare = useCallback(async () => {
    if (!data) return
    const text = copy.shareText(data.year, data.rank, data.totalHours, data.mediaCount)
    if (navigator.share) {
      await navigator.share({ title: copy.shareTitle(data.year), text })
    } else {
      await navigator.clipboard.writeText(text)
    }
  }, [copy, data])

  const SLIDES = data ? [
    <Slide1 key={0} data={data} onNext={() => setSlide(1)} copy={copy} />,
    <Slide2 key={1} data={data} onNext={() => setSlide(2)} copy={copy} locale={locale} />,
    <Slide3 key={2} data={data} onNext={() => setSlide(3)} copy={copy} locale={locale} />,
    <Slide4 key={3} data={data} onNext={() => setSlide(4)} copy={copy} />,
    <Slide5 key={4} data={data} onShare={handleShare} copy={copy} locale={locale} />,
  ] : []

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <p className="text-zinc-400 text-sm">{copy.loading(year)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-3 pt-safe-top">
        {SLIDES.map((_, i) => (
          <div
            key={i}
            onClick={() => setSlide(i)}
            className="flex-1 h-1 rounded-full overflow-hidden bg-white/20 cursor-pointer"
          >
            <div
              className="h-full bg-white rounded-full transition-all duration-300"
              style={{ width: i < slide ? '100%' : i === slide ? '100%' : '0%' }}
            />
          </div>
        ))}
      </div>

      {/* Close */}
      <button
        onClick={() => router.back()}
        className="absolute top-8 right-4 z-20 w-9 h-9 bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-white"
      >
        <X size={18} />
      </button>

      {/* Current slide */}
      <div className="flex-1 relative overflow-hidden">
        {data && SLIDES[slide]}
      </div>

      {/* Navigation dots */}
      <div className="flex justify-center gap-2 py-4 pb-safe-bottom">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlide(i)}
            className={`rounded-full transition-all ${i === slide ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/30'}`}
          />
        ))}
      </div>
    </div>
  )
}
