'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, Gamepad2, Film, Tv, Gem, Briefcase, Calendar, Plane, Layers, Sparkles, Library } from 'lucide-react'
import { PageScaffold } from '@/components/ui/PageScaffold'

const AVG_ANIME_EP_MINUTES = 24
const AVG_MANGA_CHAPTER_MINUTES = 5
const AVG_MOVIE_MINUTES = 110
const AVG_TV_EP_MINUTES = 45

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
  totalMinutes: number
}

const statsCache = new Map<string, { entries: MediaEntry[]; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

function formatDuration(minutes: number) {
  const totalHours = Math.floor(minutes / 60)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  const mins = Math.round(minutes % 60)
  return { days, hours, minutes: mins, totalHours }
}

function formatReadable(minutes: number): string {
  const { days, hours, minutes: mins } = formatDuration(minutes)
  const parts = []
  if (days > 0) parts.push(`${days} giorni`)
  if (hours > 0) parts.push(`${hours} ore`)
  if (mins > 0 && days === 0) parts.push(`${mins} minuti`)
  return parts.join(', ') || '0 minuti'
}

function StatBar({ label, icon: Icon, hours, color, detail, maxHours = 1 }: {
  label: string
  icon: React.ElementType
  hours: number
  color: string
  detail: string
  maxHours?: number
}) {
  const pct = Math.min(Math.round((hours / maxHours) * 100), 100)
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-black/20 ring-1 ring-white/5" style={{ color }}>
            <Icon size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--text-primary)]">{label}</p>
            <p className="gk-mono text-[var(--text-muted)]">{detail}</p>
          </div>
        </div>
        <span className="font-mono-data text-sm font-black text-[var(--text-primary)]">{Math.round(hours)}h</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/25 ring-1 ring-white/5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-[220px] rounded-[30px] bg-[var(--bg-card)]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-2xl bg-[var(--bg-card)]" />)}
      </div>
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[78px] rounded-2xl bg-[var(--bg-card)]" />)}
    </div>
  )
}

function TimeStat({ label, value, suffix, accent = false }: { label: string; value: string | number; suffix?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-mono-data text-[22px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
        {value}<span className="ml-1 text-[11px] font-bold text-[var(--text-muted)]">{suffix}</span>
      </p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

export default function StatsPage() {
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    let userId: string | null = null

    const load = async (forceRefresh = false) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setIsLoggedIn(true)
      userId = user.id

      if (!forceRefresh) {
        const cached = statsCache.get(user.id)
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          setEntries(cached.entries)
          setLoading(false)
          return
        }
      }

      const { data } = await supabase
        .from('user_media_entries')
        .select('type, current_episode, is_steam, episodes, status')
        .eq('user_id', user.id)

      const result = data || []
      statsCache.set(user.id, { entries: result, ts: Date.now() })
      setEntries(result)
      setLoading(false)
    }

    load()

    const CH = 'stats-media-changes'
    const existingCh = supabase.getChannels().find(c => c.topic === `realtime:${CH}`)
    const channel = existingCh ?? supabase
      .channel(CH)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_media_entries' },
        () => {
          if (userId) statsCache.delete(userId)
          load(true)
        }
      )
      .subscribe()

    return () => { if (!existingCh) supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo<Stats>(() => {
    const anime = entries.filter(e => e.type === 'anime')
    const manga = entries.filter(e => e.type === 'manga')
    const movies = entries.filter(e => e.type === 'movie')
    const tv = entries.filter(e => e.type === 'tv')
    const games = entries.filter(e => e.type === 'game')

    const animeEpisodes = anime.reduce((s, e) => s + (e.current_episode || 0), 0)
    const animeMinutes = animeEpisodes * AVG_ANIME_EP_MINUTES
    const mangaChapters = manga.reduce((s, e) => s + (e.current_episode || 0), 0)
    const mangaMinutes = mangaChapters * AVG_MANGA_CHAPTER_MINUTES
    const movieCount = movies.filter(e => e.status === 'completed' || (e.current_episode || 0) >= 1).length
    const movieMinutes = movieCount * AVG_MOVIE_MINUTES
    const tvEpisodes = tv.reduce((s, e) => s + (e.current_episode || 0), 0)
    const tvMinutes = tvEpisodes * AVG_TV_EP_MINUTES
    const gameHours = games.reduce((s, e) => s + (e.current_episode || 0), 0)

    const totalMinutes = animeMinutes + mangaMinutes + movieMinutes + tvMinutes + (gameHours * 60)

    return {
      animeHours: animeMinutes / 60, animeEpisodes,
      mangaHours: mangaMinutes / 60, mangaChapters,
      gameHours,
      movieHours: movieMinutes / 60, movieCount,
      tvHours: tvMinutes / 60, tvEpisodes,
      totalMinutes,
    }
  }, [entries])

  const comparisons = useMemo(() => {
    const hours = stats.totalMinutes / 60
    return [
      { label: 'Trilogie estese del Signore degli Anelli', value: (hours / 11.4).toFixed(1), Icon: Gem },
      { label: 'Pizze mangiate con calma', value: Math.round(stats.totalMinutes / 30).toLocaleString('it'), Icon: Clock },
      { label: 'Giri del mondo in aereo', value: (hours / 20).toFixed(1), Icon: Plane },
      { label: 'Settimane lavorative full-time', value: (hours / 40).toFixed(1), Icon: Briefcase },
      { label: 'Giorni di vita convertiti in media', value: (hours / 24).toFixed(1), Icon: Calendar },
    ]
  }, [stats.totalMinutes])

  const { days, hours: remHours, minutes: remMins, totalHours } = formatDuration(stats.totalMinutes)
  const maxH = Math.max(stats.animeHours, stats.gameHours, stats.tvHours, stats.movieHours, stats.mangaHours, 1)

  if (!isLoggedIn && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6 text-center text-white">
        <div>
          <Clock size={48} className="mx-auto mb-4 text-zinc-600" />
          <p className="mb-2 text-xl font-semibold">Accedi per vedere le tue statistiche</p>
          <p className="mb-6 text-zinc-500">Traccia la tua collezione e scopri il tuo Time DNA.</p>
          <Link href="/login" className="rounded-2xl px-6 py-3 font-semibold transition-all" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>Accedi</Link>
        </div>
      </div>
    )
  }

  return (
    <PageScaffold
      title="Stats"
      description="Quanto tempo hai trasformato in anime, manga, film, serie e videogiochi."
      icon={<Clock size={16} />}
      contentClassName="max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      {loading ? <StatsSkeleton /> : (
        <>
          <div className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.92))] p-4 text-center shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-6">
            <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
              <Sparkles size={12} />
              Time DNA
            </div>
            <p className="gk-label mb-3">Totale stimato</p>
            <div className="mb-4 flex items-end justify-center gap-4">
              {days > 0 && (
                <div>
                  <p className="gk-display text-[var(--text-primary)]">{days}</p>
                  <p className="text-sm text-[var(--text-muted)]">giorni</p>
                </div>
              )}
              {remHours > 0 && (
                <div>
                  <p className="gk-display text-[var(--accent)]">{remHours}</p>
                  <p className="text-sm text-[var(--text-muted)]">ore</p>
                </div>
              )}
              {remMins > 0 && days === 0 && (
                <div>
                  <p className="gk-display text-[var(--accent)]">{remMins}</p>
                  <p className="text-sm text-[var(--text-muted)]">minuti</p>
                </div>
              )}
              {stats.totalMinutes === 0 && <p className="gk-display text-zinc-600">0</p>}
            </div>
            <p className="gk-body mx-auto max-w-md">{formatReadable(stats.totalMinutes)}</p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
              <TimeStat label="ore totali" value={Math.round(totalHours)} accent />
              <TimeStat label="titoli" value={entries.length} />
              <TimeStat label="media/titolo" value={entries.length ? Math.round(totalHours / entries.length) : 0} suffix="h" />
            </div>
          </div>

          {stats.totalMinutes === 0 ? (
            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                <Library size={28} className="text-[var(--text-muted)]" />
              </div>
              <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun dato ancora</p>
              <p className="gk-body mx-auto mb-5 max-w-sm">Aggiungi media alla Library per calcolare il tuo Time DNA.</p>
              <Link href="/discover" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
                Apri Discover
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 space-y-2">
                {stats.animeHours > 0 && <StatBar label="Anime" icon={Tv} hours={stats.animeHours} color="var(--type-anime)" detail={`${stats.animeEpisodes} ep`} maxHours={maxH} />}
                {stats.gameHours > 0 && <StatBar label="Videogiochi" icon={Gamepad2} hours={stats.gameHours} color="var(--type-game)" detail="ore Steam" maxHours={maxH} />}
                {stats.tvHours > 0 && <StatBar label="Serie TV" icon={Tv} hours={stats.tvHours} color="var(--type-tv)" detail={`${stats.tvEpisodes} ep`} maxHours={maxH} />}
                {stats.movieHours > 0 && <StatBar label="Film" icon={Film} hours={stats.movieHours} color="var(--type-movie)" detail={`${stats.movieCount} film`} maxHours={maxH} />}
                {stats.mangaHours > 0 && <StatBar label="Manga" icon={Layers} hours={stats.mangaHours} color="var(--type-manga)" detail={`${stats.mangaChapters} cap`} maxHours={maxH} />}
              </div>

              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-4 md:p-5">
                <p className="gk-label mb-4">Equivale a…</p>
                <div className="space-y-3">
                  {comparisons.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-black/20 text-[var(--text-muted)] ring-1 ring-white/5">
                          <c.Icon size={17} />
                        </div>
                        <span className="line-clamp-1 text-xs font-semibold text-[var(--text-secondary)]">{c.label}</span>
                      </div>
                      <span className="font-mono-data flex-shrink-0 text-sm font-black text-[var(--text-primary)]">{c.value}×</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </PageScaffold>
  )
}
