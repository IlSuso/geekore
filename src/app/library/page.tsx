'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { BookOpen, LayoutGrid, List, Search, X, Star, Plus, Clock, Trophy, BarChart3, CheckSquare, Square, Trash2, CheckCircle2, Layers, SlidersHorizontal } from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { PageScaffold } from '@/components/ui/PageScaffold'
import { PageHero } from '@/components/ui/PageHero'
import { FilterBar } from '@/components/ui/FilterBar'
import { MediaGrid } from '@/components/ui/MediaGrid'
import type { MediaRailItem } from '@/components/ui/MediaRail'
import { CompactMediaRow } from '@/components/ui/CompactMediaRow'
import { MediaGridSkeleton } from '@/components/ui/MediaSkeletons'
import { ActionButton } from '@/components/ui/ActionButton'
import { getMediaStatusLabel } from '@/lib/mediaStatus'

type MediaEntry = {
  id: string
  title: string
  title_en?: string
  type: string
  cover_image?: string
  current_episode: number
  episodes?: number
  updated_at: string
  rating?: number
  status?: string
  genres?: string[]
  external_id?: string
}

type ViewMode = 'list' | 'grid' | 'stats'

const STATUS_FILTERS = [
  { id: 'all', label: 'Tutto' },
  { id: 'watching', label: 'In corso' },
  { id: 'completed', label: 'Completati' },
  { id: 'planning', label: 'Wishlist' },
]

const TYPE_FILTERS = [
  { id: 'all', label: 'Tutti' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
  { id: 'game', label: 'Game' },
  { id: 'tv', label: 'TV' },
  { id: 'movie', label: 'Film' },
  { id: 'boardgame', label: 'Board' },
]

const TYPE_COLORS: Record<string, string> = {
  anime: 'var(--type-anime)',
  manga: 'var(--type-manga)',
  game: 'var(--type-game)',
  boardgame: 'var(--type-board)',
  movie: 'var(--type-movie)',
  tv: 'var(--type-tv)',
}

function normalizeType(type: string): string {
  return type === 'board_game' ? 'boardgame' : type
}

function normalizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http://store-images.s-microsoft.com')) {
    return url.replace('http://store-images.s-microsoft.com', 'https://store-images.s-microsoft.com')
  }
  return url
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function defaultLibraryViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'grid'
  return window.matchMedia('(min-width: 768px)').matches ? 'grid' : 'list'
}

function toRailItem(entry: MediaEntry): MediaRailItem {
  return {
    id: entry.id,
    title: entry.title,
    type: normalizeType(entry.type),
    coverImage: normalizeImageUrl(entry.cover_image),
    score: entry.rating,
    status: entry.status,
    progress: entry.episodes && entry.episodes > 0
      ? { current: entry.current_episode || 0, total: entry.episodes }
      : undefined,
  }
}

function LibraryHeatmap({ entries }: { entries: MediaEntry[] }) {
  const weeks = useMemo(() => {
    const now = new Date()
    const days = Array.from({ length: 182 }, (_, index) => {
      const date = new Date(now)
      date.setDate(now.getDate() - (181 - index))
      const key = date.toISOString().slice(0, 10)
      return { key, count: 0 }
    })
    const map = new Map(days.map(day => [day.key, day]))
    for (const entry of entries) {
      const key = new Date(entry.updated_at).toISOString().slice(0, 10)
      const bucket = map.get(key)
      if (bucket) bucket.count += 1
    }
    return days
  }, [entries])

  const max = Math.max(1, ...weeks.map(day => day.count))

  return (
    <div className="rounded-[28px] border border-[rgba(230,255,61,0.16)] bg-[linear-gradient(135deg,rgba(230,255,61,0.075),rgba(20,20,27,0.94))] p-4 ring-1 ring-white/5" data-no-swipe="true">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="gk-label text-[var(--accent)]">Heatmap anno</p>
          <h2 className="gk-headline text-[var(--text-primary)]">Il ritmo della tua collezione</h2>
        </div>
        <span className="gk-mono text-[var(--text-muted)]">ultimi 6 mesi</span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1" data-horizontal-scroll="true" data-no-swipe="true">
        {weeks.map(day => {
          const level = day.count === 0 ? 0 : Math.max(0.18, day.count / max)
          return (
            <div
              key={day.key}
              title={`${day.key}: ${day.count} aggiornamenti`}
              className="h-3 w-3 rounded-[4px] border border-white/5"
              style={{ background: day.count ? `rgba(230,255,61,${level})` : 'rgba(255,255,255,0.045)' }}
            />
          )
        })}
      </div>
    </div>
  )
}

function StatsView({ entries, stats }: { entries: MediaEntry[]; stats: ReturnType<typeof computeStats> }) {
  const typeRows = Object.entries(stats.byType).sort(([, a], [, b]) => b - a)
  const genreRows = Object.entries(stats.byGenre).sort(([, a], [, b]) => b - a).slice(0, 10)
  const maxType = Math.max(1, ...typeRows.map(([, count]) => count))
  const maxGenre = Math.max(1, ...genreRows.map(([, count]) => count))

  return (
    <div className="space-y-5">
      <LibraryHeatmap entries={entries} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="gk-label mb-4">Medium</p>
          <div className="space-y-3">
            {typeRows.map(([type, count]) => (
              <div key={type}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[var(--text-primary)]">{type}</span>
                  <span className="gk-mono text-[var(--text-muted)]">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((count / maxType) * 100)}%`, background: TYPE_COLORS[type] || 'var(--accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="gk-label mb-4">Generi più presenti</p>
          <div className="space-y-3">
            {genreRows.length ? genreRows.map(([genre, count]) => (
              <div key={genre}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="line-clamp-1 text-sm font-bold text-[var(--text-primary)]">{genre}</span>
                  <span className="gk-mono text-[var(--text-muted)]">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round((count / maxGenre) * 100)}%` }} />
                </div>
              </div>
            )) : (
              <p className="gk-caption">Aggiungi generi ai media per vedere questa sezione.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function computeStats(entries: MediaEntry[]) {
  const currentYear = new Date().getFullYear()
  const rated = entries.filter(e => typeof e.rating === 'number')
  const averageRating = rated.length
    ? rated.reduce((sum, e) => sum + Number(e.rating || 0), 0) / rated.length
    : 0
  const completed = entries.filter(e => e.status === 'completed').length
  const byType: Record<string, number> = {}
  const byGenre: Record<string, number> = {}
  for (const entry of entries) {
    const type = normalizeType(entry.type)
    byType[type] = (byType[type] || 0) + 1
    for (const genre of entry.genres || []) byGenre[genre] = (byGenre[genre] || 0) + 1
  }

  return {
    total: entries.length,
    thisYear: entries.filter(e => new Date(e.updated_at).getFullYear() === currentYear).length,
    inProgress: entries.filter(e => e.status === 'watching' || e.status === 'reading').length,
    completed,
    totalProgress: entries.reduce((sum, e) => sum + (e.current_episode || 0), 0),
    mediaTypes: new Set(entries.map(e => normalizeType(e.type))).size,
    averageRating,
    byType,
    byGenre,
  }
}

export default function LibraryPage() {
  const router = useRouter()
  const { user: authUser, loading: authLoading } = useAuth()
  const supabase = createClient()
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(defaultLibraryViewMode)
  const [drawerMedia, setDrawerMedia] = useState<MediaDetails | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!authUser) {
      router.push('/login')
      return
    }

    let cancelled = false
    setLoading(true)

    supabase
      .from('user_media_entries')
      .select('id, title, title_en, type, cover_image, current_episode, episodes, updated_at, rating, status, genres, external_id')
      .eq('user_id', authUser.id)
      .order('updated_at', { ascending: false })
      .limit(10000)
      .then(({ data }: { data: MediaEntry[] | null }) => {
        if (cancelled) return
        setEntries((data || []).map(entry => ({
          ...entry,
          type: normalizeType(entry.type),
          cover_image: normalizeImageUrl(entry.cover_image),
        })))
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [authUser, authLoading, router, supabase])

  const filtered = useMemo(() => {
    const query = normalize(searchTerm)
    let result = entries

    if (statusFilter !== 'all') result = result.filter(e => (e.status || 'planning') === statusFilter)
    if (typeFilter !== 'all') result = result.filter(e => normalizeType(e.type) === typeFilter)

    if (query) {
      result = result.filter(e => {
        const haystack = [e.title, e.title_en || '', normalizeType(e.type), ...(e.genres || []), getMediaStatusLabel(e.status || 'planning')].map(normalize).join(' ')
        return haystack.includes(query)
      })
    }
    return result
  }, [entries, statusFilter, typeFilter, searchTerm])

  const stats = useMemo(() => computeStats(entries), [entries])

  const grouped = useMemo((): { status: string; items: MediaEntry[] }[] => {
    if (statusFilter !== 'all') return [{ status: statusFilter, items: filtered }]
    const order = ['watching', 'reading', 'completed', 'planning', 'paused', 'dropped']
    const groups: Record<string, MediaEntry[]> = {}
    for (const e of filtered) {
      const key = e.status || 'planning'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return order.filter(k => groups[k]?.length).map(k => ({ status: k, items: groups[k] }))
  }, [filtered, statusFilter])

  function openDrawer(entry: MediaEntry) {
    if (selectMode) {
      toggleSelected(entry.id)
      return
    }
    setDrawerMedia({
      id: entry.external_id || entry.id,
      title: entry.title,
      title_en: entry.title_en,
      type: normalizeType(entry.type),
      coverImage: normalizeImageUrl(entry.cover_image),
      episodes: entry.episodes,
      genres: entry.genres,
      source: 'anilist' as any,
    })
  }

  const gridItems = useMemo(() => filtered.map(toRailItem), [filtered])
  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || searchTerm.trim().length > 0
  const selectedCount = selectedIds.size

  const clearFilters = () => { setSearchTerm(''); setStatusFilter('all'); setTypeFilter('all') }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
  }

  async function bulkSetStatus(status: string) {
    if (!authUser || selectedIds.size === 0 || bulkBusy) return
    const ids = Array.from(selectedIds)
    setBulkBusy(true)
    const prev = entries
    setEntries(current => current.map(entry => ids.includes(entry.id) ? { ...entry, status } : entry))
    const { error } = await supabase.from('user_media_entries').update({ status }).eq('user_id', authUser.id).in('id', ids)
    if (error) setEntries(prev)
    else { setSelectedIds(new Set()); setSelectMode(false) }
    setBulkBusy(false)
  }

  async function bulkDelete() {
    if (!authUser || selectedIds.size === 0 || bulkBusy) return
    const ids = Array.from(selectedIds)
    setBulkBusy(true)
    const prev = entries
    setEntries(current => current.filter(entry => !ids.includes(entry.id)))
    const { error } = await supabase.from('user_media_entries').delete().eq('user_id', authUser.id).in('id', ids)
    if (error) setEntries(prev)
    else { setSelectedIds(new Set()); setSelectMode(false) }
    setBulkBusy(false)
  }

  return (
    <PageScaffold
      title="Library"
      description="La tua collezione viva: progressi, completati, wishlist e voto medio in un unico spazio compatto."
      icon={<BookOpen size={16} />}
      className="gk-library-page"
      contentClassName="gk-page-density mx-auto max-w-screen-xl pt-2 md:pt-8 pb-28"
    >
      <PageHero
        eyebrow="Media vault"
        title="Library"
        description="La tua collezione media in forma visiva: guarda tutto, filtra veloce e passa da copertine, lista e statistiche senza perdere contesto."
        icon={<BookOpen size={14} />}
        actions={[
          { label: 'Aggiungi', href: '/discover', icon: <Plus size={14} /> },
          { label: selectMode ? 'Annulla selezione' : 'Seleziona', onClick: toggleSelectMode, icon: <CheckSquare size={14} />, variant: 'secondary' },
        ]}
        stats={[
          { label: 'Totale', value: stats.total, accent: true, icon: <BookOpen size={14} /> },
          { label: 'Completati', value: stats.completed, icon: <Trophy size={14} /> },
          { label: 'In corso', value: stats.inProgress, icon: <Clock size={14} /> },
        ]}
      />

      <div className="sticky top-0 z-20 mb-5 rounded-[26px] border border-[var(--border)] bg-[rgba(16,16,22,0.86)] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.22)] ring-1 ring-white/5 backdrop-blur-xl" data-no-swipe="true" data-interactive="true">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input data-no-swipe="true" type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cerca titolo, genere, medium..." className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-3 pl-10 pr-10 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]" />
            {searchTerm && <button type="button" data-no-swipe="true" onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35" aria-label="Cancella ricerca libreria"><X size={14} /></button>}
          </div>

          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <p className="hidden whitespace-nowrap gk-mono text-[var(--text-muted)] sm:block">{filtered.length} elementi</p>
            <div className="flex flex-shrink-0 items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-1" data-no-swipe="true" aria-label="Vista Library">
              {([
                ['grid', <LayoutGrid key="grid" size={15} />, 'Griglia'],
                ['list', <List key="list" size={15} />, 'Lista'],
                ['stats', <BarChart3 key="stats" size={15} />, 'Stats'],
              ] as [ViewMode, React.ReactNode, string][]).map(([mode, icon, label]) => (
                <button key={mode} type="button" data-no-swipe="true" onClick={() => setViewMode(mode)} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35" style={{ background: viewMode === mode ? 'var(--accent)' : 'transparent', color: viewMode === mode ? '#0B0B0F' : 'var(--text-muted)' }} aria-label={`Vista ${mode}`} aria-pressed={viewMode === mode}>
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-[22px] border border-[var(--border-subtle)] bg-black/16 p-2">
          <div className="mb-2 grid grid-cols-4 gap-1">
            {STATUS_FILTERS.map(filter => {
              const active = statusFilter === filter.id
              return (
                <button
                  key={filter.id}
                  type="button"
                  data-no-swipe="true"
                  onClick={() => setStatusFilter(filter.id)}
                  className="min-h-10 rounded-xl px-1 py-2 text-[11px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 sm:text-[12px]"
                  style={active ? { background: 'rgba(230,255,61,0.09)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
                  aria-pressed={active}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <SlidersHorizontal size={13} />
              <p className="gk-label text-[var(--text-muted)]">Tipo media</p>
            </div>
            <FilterBar items={TYPE_FILTERS} activeId={typeFilter} onChange={(id) => setTypeFilter(id)} className="mx-0 px-0 md:justify-end" chipClassName="h-8 px-3 text-[12px]" ariaLabel="Filtri tipo media Library" />
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2">
            <span className="gk-mono text-[var(--text-muted)]">{filtered.length} risultati su {entries.length}</span>
            <button type="button" data-no-swipe="true" onClick={clearFilters} className="gk-mono rounded-lg px-2 py-1 text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">reset</button>
          </div>
        )}
      </div>

      {selectMode && (
        <div className="sticky top-[142px] z-20 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[rgba(230,255,61,0.28)] bg-[linear-gradient(135deg,rgba(230,255,61,0.14),rgba(22,22,30,0.96))] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.28)] ring-1 ring-white/5 backdrop-blur-xl" data-no-swipe="true">
          <div>
            <p className="text-sm font-black text-[var(--accent)]">Modalità selezione</p>
            <p className="gk-caption">{selectedCount} elementi selezionati</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-no-swipe="true" disabled={selectedCount === 0 || bulkBusy} onClick={() => bulkSetStatus('completed')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-white disabled:opacity-40"><CheckCircle2 size={13} /> completati</button>
            <button type="button" data-no-swipe="true" disabled={selectedCount === 0 || bulkBusy} onClick={() => bulkSetStatus('planning')} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-white disabled:opacity-40"><Layers size={13} /> wishlist</button>
            <button type="button" data-no-swipe="true" disabled={selectedCount === 0 || bulkBusy} onClick={bulkDelete} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/10 px-3 text-xs font-bold text-red-300 transition-colors hover:bg-red-500/15 disabled:opacity-40"><Trash2 size={13} /> elimina</button>
          </div>
        </div>
      )}

      {authLoading || loading ? (
        viewMode === 'grid' ? <MediaGridSkeleton count={21} showMeta /> : <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[74px] rounded-2xl bg-[var(--bg-card)] skeleton" />)}</div>
      ) : filtered.length === 0 ? (
        entries.length === 0 ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14">
            <div className="mb-8 text-center">
              <p className="gk-h2 mb-2 text-[var(--text-primary)]">La tua Library è vuota</p>
              <p className="gk-body mx-auto max-w-sm">Inizia importando le tue librerie esistenti o aggiungendo media da Discover.</p>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { href: '/settings?tab=import&platform=anilist', label: 'AniList', subtitle: 'Anime & Manga', color: 'var(--type-anime)' },
                { href: '/settings?tab=import&platform=steam', label: 'Steam', subtitle: 'Videogiochi', color: 'var(--type-game)' },
                { href: '/settings?tab=import&platform=letterboxd', label: 'Letterboxd', subtitle: 'Film', color: 'var(--type-movie)' },
                { href: '/settings?tab=import&platform=mal', label: 'MyAnimeList', subtitle: 'Anime & Manga', color: 'var(--type-manga)' },
              ].map(({ href, label, subtitle, color }) => (
                <Link
                  key={label}
                  href={href}
                  data-no-swipe="true"
                  className="flex flex-col items-center gap-2 rounded-[20px] border p-4 text-center transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                  style={{ borderColor: `color-mix(in srgb, ${color} 20%, transparent)`, background: `color-mix(in srgb, ${color} 5%, transparent)` }}
                >
                  <span className="gk-headline" style={{ color }}>{label}</span>
                  <span className="gk-caption">{subtitle}</span>
                </Link>
              ))}
            </div>
            <div className="text-center">
              <ActionButton href="/discover">Oppure sfoglia Discover →</ActionButton>
            </div>
          </div>
        ) : (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-20 text-center">
            <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun elemento trovato</p>
            <p className="gk-body mx-auto mb-6 max-w-sm">{hasActiveFilters ? 'Prova a cambiare ricerca o filtri.' : 'Prova a cambiare i filtri.'}</p>
            {hasActiveFilters && <button type="button" data-no-swipe="true" onClick={clearFilters} className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[#0B0B0F] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">Cancella filtri</button>}
          </div>
        )
      ) : viewMode === 'stats' ? (
        <StatsView entries={filtered} stats={computeStats(filtered)} />
      ) : viewMode === 'grid' ? (
        <MediaGrid items={gridItems} showMetaRow onItemClick={(item) => { const entry = filtered.find(e => e.id === item.id); if (entry) openDrawer(entry) }} />
      ) : (
        <div className="space-y-7">
          {grouped.map(({ status, items }) => (
            <section key={status}>
              <div className="mb-2 flex items-center gap-2"><h2 className="gk-label">{getMediaStatusLabel(status)}</h2><span className="gk-mono text-[var(--text-muted)]">{items.length}</span></div>
              <div className="space-y-1.5">
                {items.map(entry => {
                  const color = TYPE_COLORS[normalizeType(entry.type)] || 'var(--border)'
                  const selected = selectedIds.has(entry.id)
                  return (
                    <CompactMediaRow
                      key={entry.id}
                      title={entry.title}
                      type={normalizeType(entry.type)}
                      coverImage={normalizeImageUrl(entry.cover_image)}
                      status={entry.status || 'planning'}
                      score={entry.rating}
                      progress={entry.episodes && entry.episodes > 0 ? { current: entry.current_episode || 0, total: entry.episodes } : undefined}
                      trailing={<div className="flex min-w-[54px] flex-col items-end gap-1">{selectMode ? (selected ? <CheckSquare size={18} className="text-[var(--accent)]" /> : <Square size={18} className="text-[var(--text-muted)]" />) : <><span className="h-2 w-2 rounded-full" style={{ background: color }} />{typeof entry.rating === 'number' ? <span className="inline-flex items-center gap-1 font-mono-data text-[12px] font-bold text-[var(--text-primary)]"><Star size={11} className="text-[var(--accent)]" fill="var(--accent)" />{entry.rating}</span> : <span className="gk-mono text-[var(--text-muted)]">—</span>}</>}</div>}
                      onClick={() => openDrawer(entry)}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <MediaDetailsDrawer media={drawerMedia} onClose={() => setDrawerMedia(null)} />
    </PageScaffold>
  )
}
