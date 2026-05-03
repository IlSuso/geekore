'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import type { ElementType } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, Gamepad2, Film, Tv, Gem, Calendar, Layers, Library, BarChart3, Sparkles } from 'lucide-react'
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

type CategoryStat = {
  id: string
  label: string
  icon: ElementType
  hours: number
  detail: string
  color: string
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

function compactHours(hours: number): string {
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k`
  return Math.round(hours).toLocaleString('it')
}

function StatsSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-[180px] rounded-[28px] bg-[var(--bg-card)]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-[var(--bg-card)]" />)}
      </div>
      <div className="h-[260px] rounded-[28px] bg-[var(--bg-card)]" />
    </div>
  )
}

function MetricCard({ label, value, detail, accent = false }: { label: string; value: string | number; detail?: string; accent?: boolean }) {
  return (
    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/55 px-4 py-3 ring-1 ring-white/5">
      <p className="gk-label mb-1">{label}</p>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <p className={`truncate font-mono-data text-[23px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
        {detail && <p className="shrink-0 text-right text-[11px] leading-4 text-[var(--text-muted)]">{detail}</p>}
      </div>
    </div>
  )
}

function CategoryCard({ item, maxHours }: { item: CategoryStat; maxHours: number }) {
  const Icon = item.icon
  const pct = Math.max(3, Math.min(Math.round((item.hours / maxHours) * 100), 100))
  const isMinor = item.hours < maxHours * 0.08
  return (
    <div className={`rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/70 px-4 py-3 ring-1 ring-white/5 ${isMinor ? 'md:col-span-1' : ''}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[14px] bg-black/18 ring-1 ring-white/5" style={{ color: item.color }}>
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-black text-[var(--text-primary)]">{item.label}</p>
            <p className="gk-mono text-[var(--text-muted)]">{item.detail}</p>
          </div>
        </div>
        <p className="shrink-0 font-mono-data text-[16px] font-black text-[var(--text-primary)]">{compactHours(item.hours)}h</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/24 ring-1 ring-white/5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: item.color }} />
      </div>
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

  const { days, hours: remHours, totalHours } = formatDuration(stats.totalMinutes)
  const totalHoursRounded = Math.round(totalHours)

  const categories = useMemo<CategoryStat[]>(() => [
    { id: 'game', label: 'Videogiochi', icon: Gamepad2, hours: stats.gameHours, detail: 'ore Steam', color: 'var(--type-game)' },
    { id: 'movie', label: 'Film', icon: Film, hours: stats.movieHours, detail: `${stats.movieCount} film`, color: 'var(--type-movie)' },
    { id: 'anime', label: 'Anime', icon: Tv, hours: stats.animeHours, detail: `${stats.animeEpisodes} ep`, color: 'var(--type-anime)' },
    { id: 'tv', label: 'Serie TV', icon: Tv, hours: stats.tvHours, detail: `${stats.tvEpisodes} ep`, color: 'var(--type-tv)' },
    { id: 'manga', label: 'Manga', icon: Layers, hours: stats.mangaHours, detail: `${stats.mangaChapters} cap`, color: 'var(--type-manga)' },
  ].filter(item => item.hours > 0), [stats])

  const maxH = Math.max(...categories.map(c => c.hours), 1)
  const topCategory = categories[0] ? [...categories].sort((a, b) => b.hours - a.hours)[0] : null
  const topShare = topCategory && totalHours > 0 ? Math.round((topCategory.hours / totalHours) * 100) : 0
  const insight = topCategory
    ? `La tua libreria è trainata da ${topCategory.label.toLowerCase()}: circa ${topShare}% del tuo tempo registrato.`
    : 'Aggiungi titoli alla collezione per iniziare a costruire il tuo Time DNA.'

  const comparisons = useMemo(() => {
    const hours = stats.totalMinutes / 60
    return [
      { label: 'Giorni pieni di contenuto', value: (hours / 24).toFixed(1), Icon: Calendar },
      { label: 'Maratone cinematografiche da 3 ore', value: Math.round(hours / 3).toLocaleString('it'), Icon: Film },
      { label: 'Trilogie estese del Signore degli Anelli', value: (hours / 11.4).toFixed(1), Icon: Gem },
    ]
  }, [stats.totalMinutes])

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
      icon={<BarChart3 size={16} />}
      contentClassName="mx-auto max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      {loading ? <StatsSkeleton /> : (
        <>
          <div className="mb-4 overflow-hidden rounded-[28px] border border-[rgba(230,255,61,0.16)] bg-[radial-gradient(circle_at_16%_0%,rgba(230,255,61,0.12),transparent_42%),linear-gradient(145deg,rgba(230,255,61,0.05),var(--bg-secondary))] p-5 ring-1 ring-white/5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="gk-section-eyebrow"><Clock size={13} /> Time DNA</div>
              <Link href="/profile" data-no-swipe="true" className="hidden h-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/14 px-4 text-xs font-black text-[var(--text-secondary)] transition-colors hover:text-white md:inline-flex">
                Apri profilo
              </Link>
            </div>
            <h1 className="font-display text-[34px] font-black leading-none tracking-[-0.05em] text-[var(--text-primary)] md:text-[44px]">{formatReadable(stats.totalMinutes)}</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--text-secondary)]">Stima aggregata da episodi, capitoli, film completati e ore di gioco registrate.</p>
            <div className="mt-4 rounded-2xl border border-[rgba(230,255,61,0.12)] bg-black/18 px-4 py-3 text-[13px] font-semibold leading-5 text-[var(--text-secondary)]">
              <span className="text-[var(--accent)]">Insight:</span> {insight}
            </div>
          </div>

          {stats.totalMinutes === 0 ? (
            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                <Library size={28} className="text-[var(--text-muted)]" />
              </div>
              <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun dato ancora</p>
              <p className="gk-body mx-auto mb-5 max-w-sm">Aggiungi media alla collezione per calcolare il tuo Time DNA.</p>
              <Link href="/discover" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
                Apri Discover
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <MetricCard label="ore totali" value={compactHours(totalHoursRounded)} accent detail={days > 0 ? `${days}g ${remHours}h` : undefined} />
                <MetricCard label="titoli" value={entries.length.toLocaleString('it')} detail="collezione" />
                <MetricCard label="ore per titolo" value={entries.length ? Math.round(totalHours / entries.length) : 0} detail="media" />
                <MetricCard label="categoria dominante" value={topCategory?.label || '—'} detail={topCategory ? `${compactHours(topCategory.hours)}h` : undefined} />
              </div>

              <section className="mb-5 rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/64 p-4 ring-1 ring-white/5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="mb-1 gk-section-eyebrow"><Sparkles size={12} /> Distribuzione</div>
                    <h2 className="font-display text-[22px] font-black tracking-[-0.04em] text-[var(--text-primary)]">Ore per categoria</h2>
                  </div>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {categories.map(item => <CategoryCard key={item.id} item={item} maxHours={maxH} />)}
                </div>
              </section>

              <section className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/58 p-4 ring-1 ring-white/5">
                <p className="gk-label mb-3">In prospettiva</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {comparisons.map((c, i) => (
                    <div key={i} className="rounded-2xl border border-[var(--border-subtle)] bg-black/14 p-3 ring-1 ring-white/5">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(230,255,61,0.08)] text-[var(--accent)]">
                        <c.Icon size={18} />
                      </div>
                      <p className="font-mono-data text-[22px] font-black leading-none text-[var(--text-primary)]">{c.value}×</p>
                      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{c.label}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </PageScaffold>
  )
}
