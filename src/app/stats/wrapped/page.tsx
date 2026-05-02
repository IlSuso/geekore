'use client'
// src/app/stats/wrapped/page.tsx
// N2: Wrapped annuale stile Spotify
// Slides verticali fullscreen animate con View Transitions API
// Card 9:16 condivisibile come immagine via canvas

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronDown, Share2, X, Download, Tv, Gamepad2, Film, Trophy, Gem, Layers } from 'lucide-react'

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

function calcRank(totalHours: number): { rank: string; rankEmoji: string } {
  if (totalHours >= 2000) return { rank: 'Leggenda', rankEmoji: 'gem' }
  if (totalHours >= 500)  return { rank: 'Esperto',  rankEmoji: 'gold' }
  if (totalHours >= 100)  return { rank: 'Appassionato', rankEmoji: 'silver' }
  return { rank: 'Novizio', rankEmoji: 'bronze' }
}

// ── Slides ─────────────────────────────────────────────────────────────────────

function Slide1({ data, onNext }: { data: WrappedData; onNext: () => void }) {
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
        <p className="text-zinc-400 text-lg">Ciao, <strong className="text-white">{data.displayName}</strong></p>
        <p className="text-zinc-500 text-sm mt-2">Tocca per scoprire il tuo anno</p>
      </div>
      <ChevronDown size={24} className="absolute bottom-8 text-zinc-600 animate-bounce" />
    </div>
  )
}

function Slide2({ data, onNext }: { data: WrappedData; onNext: () => void }) {
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
      <p className="text-cyan-400 text-xs font-semibold uppercase tracking-widest mb-6">Tempo totale</p>
      <p className="text-[80px] sm:text-[100px] font-black leading-none tabular-nums text-white mb-2">
        {displayed.toLocaleString('it')}
      </p>
      <p className="text-3xl font-bold text-cyan-400 mb-6">ore</p>
      <p className="text-zinc-400 text-lg">
        Ovvero <strong className="text-white">{data.totalDays}</strong> giorni interi
      </p>
      <p className="text-zinc-600 text-sm mt-3">
        Su {data.mediaCount} titoli diversi
      </p>
    </div>
  )
}

function Slide3({ data, onNext }: { data: WrappedData; onNext: () => void }) {
  const stats = [
    { Icon: Tv,       label: 'Episodi anime',         value: data.animeEpisodes,  color: 'text-sky-400' },
    { Icon: Gamepad2, label: 'Ore di gioco',          value: data.gameHours,      color: 'text-green-400' },
    { Icon: Layers,   label: 'Cap. manga letti',      value: data.mangaChapters,  color: 'text-orange-400' },
    { Icon: Film,     label: 'Film guardati',         value: data.movieCount,     color: 'text-red-400' },
    { Icon: Tv,       label: 'Ep. serie TV',          value: data.tvEpisodes,     color: 'text-purple-400' },
  ].filter(s => s.value > 0)

  return (
    <div
      onClick={onNext}
      className="h-full flex flex-col justify-center px-8 cursor-pointer select-none"
      style={{ background: 'linear-gradient(160deg, #1a0a0e 0%, #0d0a1a 100%)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest mb-8 text-center" style={{ color: 'var(--accent)' }}>I tuoi numeri</p>
      <div className="space-y-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="flex items-center gap-4 bg-white/5 rounded-2xl px-5 py-4 border border-white/10"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <s.Icon size={28} className={s.color} />
            <div className="flex-1">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className={`text-2xl font-black tabular-nums ${s.color}`}>
                {s.value.toLocaleString('it')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide4({ data, onNext }: { data: WrappedData; onNext: () => void }) {
  return (
    <div
      onClick={onNext}
      className="h-full flex flex-col items-center justify-center text-center px-8 cursor-pointer select-none"
      style={{ background: 'linear-gradient(160deg, #0a1a0e 0%, #0d0a1a 100%)' }}
    >
      <p className="text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-6">Il tuo genere preferito</p>
      <p className="text-5xl font-black text-white mb-4">{data.topGenre || 'Vario'}</p>
      <div className="w-16 h-1 bg-emerald-400 rounded-full mb-6" />
      <p className="text-zinc-400">Il genere che hai più amato quest'anno</p>
    </div>
  )
}

function Slide5({ data, onShare }: { data: WrappedData; onShare: () => void }) {
  const { rank, rankEmoji } = calcRank(data.totalHours)

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
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--accent)' }}>Il tuo rango</p>
        <p className="text-5xl font-black text-white mb-8">{rank}</p>
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 text-sm">Ore totali</span>
            <span className="text-white font-bold">{data.totalHours.toLocaleString('it')}h</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 text-sm">Titoli</span>
            <span className="text-white font-bold">{data.mediaCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 text-sm">Genere top</span>
            <span className="font-bold" style={{ color: 'var(--accent)' }}>{data.topGenre || 'Vario'}</span>
          </div>
        </div>
        <button
          onClick={onShare}
          className="flex items-center gap-2 mx-auto px-8 py-4 rounded-2xl font-bold text-sm transition-all"
          style={{ background: '#E6FF3D', color: '#0B0B0F' }}
        >
          <Share2 size={16} />
          Condividi il tuo Wrapped
        </button>
      </div>
    </div>
  )
}

// ── Pagina principale ──────────────────────────────────────────────────────────

export default function WrappedPage() {
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
      const { rank, rankEmoji } = calcRank(totalHours)

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
  }, [])

  const handleShare = useCallback(async () => {
    if (!data) return
    const text = `Il mio ${data.year} Wrapped su Geekore!\n[${data.rank}] ${data.totalHours}h • ${data.mediaCount} titoli\ngeekore.it`
    if (navigator.share) {
      await navigator.share({ title: `Geekore Wrapped ${data.year}`, text })
    } else {
      await navigator.clipboard.writeText(text)
    }
  }, [data])

  const SLIDES = data ? [
    <Slide1 key={0} data={data} onNext={() => setSlide(1)} />,
    <Slide2 key={1} data={data} onNext={() => setSlide(2)} />,
    <Slide3 key={2} data={data} onNext={() => setSlide(3)} />,
    <Slide4 key={3} data={data} onNext={() => setSlide(4)} />,
    <Slide5 key={4} data={data} onShare={handleShare} />,
  ] : []

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: '#E6FF3D', borderTopColor: 'transparent' }} />
          <p className="text-zinc-400 text-sm">Costruendo il tuo {year} Wrapped…</p>
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

      {/* Slide corrente */}
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
