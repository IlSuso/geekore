'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { BookOpen, LayoutGrid, List } from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { PageScaffold } from '@/components/ui/PageScaffold'
import { SearchField } from '@/components/ui/SearchField'
import { FilterBar } from '@/components/ui/FilterBar'
import { SortSelect, type SortSelectOption } from '@/components/ui/SortSelect'
import { ViewToggle, type ViewToggleOption } from '@/components/ui/ViewToggle'
import { MediaGrid } from '@/components/ui/MediaGrid'
import type { MediaRailItem } from '@/components/ui/MediaRail'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'
import { MediaGridSkeleton } from '@/components/ui/MediaSkeletons'
import { ActionButton } from '@/components/ui/ActionButton'
import { getMediaTypeColor, getMediaTypeLabel } from '@/lib/mediaTypes'
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

type LibraryViewMode = 'list' | 'grid'
type LibrarySortMode = 'recent' | 'title' | 'rating' | 'progress'

const VIEW_OPTIONS: ViewToggleOption<LibraryViewMode>[] = [
  { id: 'list', label: 'Vista lista', icon: <List size={14} /> },
  { id: 'grid', label: 'Vista griglia', icon: <LayoutGrid size={14} /> },
]

const SORT_OPTIONS: SortSelectOption<LibrarySortMode>[] = [
  { id: 'recent', label: 'Recenti' },
  { id: 'title', label: 'Titolo' },
  { id: 'rating', label: 'Voto' },
  { id: 'progress', label: 'Progresso' },
]

const TYPES = [
  { id: 'all', label: 'Tutto' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
  { id: 'game', label: 'Giochi' },
  { id: 'tv', label: 'Serie' },
  { id: 'movie', label: 'Film' },
  { id: 'boardgame', label: 'Board' },
]

const STATUS_FILTERS = [
  { id: 'all', label: 'Tutti' },
  { id: 'watching', label: 'In corso' },
  { id: 'reading', label: 'Lettura' },
  { id: 'completed', label: 'Completati' },
  { id: 'planning', label: 'Pianificati' },
  { id: 'paused', label: 'In pausa' },
  { id: 'dropped', label: 'Abbandonati' },
]

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function getProgressRatio(entry: MediaEntry) {
  if (!entry.episodes || entry.episodes <= 0) return 0
  return Math.min(1, Math.max(0, (entry.current_episode || 0) / entry.episodes))
}

function toRailItem(entry: MediaEntry): MediaRailItem {
  return {
    id: entry.id,
    title: entry.title,
    type: entry.type,
    coverImage: entry.cover_image,
    score: entry.rating,
    status: entry.status,
    progress: entry.episodes && entry.episodes > 0
      ? { current: entry.current_episode || 0, total: entry.episodes }
      : undefined,
  }
}

export default function LibraryPage() {
  const router = useRouter()
  const authUser = useUser()
  const supabase = createClient()
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('all')
  const [activeStatus, setActiveStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortMode, setSortMode] = useState<LibrarySortMode>('recent')
  const [viewMode, setViewMode] = useState<LibraryViewMode>('list')
  const [drawerMedia, setDrawerMedia] = useState<MediaDetails | null>(null)

  useEffect(() => {
    if (!authUser) { router.push('/login'); return }
    supabase
      .from('user_media_entries')
      .select('id, title, title_en, type, cover_image, current_episode, episodes, updated_at, rating, status, genres, external_id')
      .eq('user_id', authUser.id)
      .order('updated_at', { ascending: false })
      .limit(10000)
      .then(({ data }: { data: MediaEntry[] | null }) => {
        setEntries(data || [])
        setLoading(false)
      })
  }, [authUser]) // eslint-disable-line

  const filtered = useMemo(() => {
    let result = activeType === 'all' ? entries : entries.filter(e => e.type === activeType)
    if (activeStatus !== 'all') result = result.filter(e => (e.status || 'planning') === activeStatus)

    const q = normalizeSearch(searchTerm)
    if (q) {
      result = result.filter(e => {
        const title = normalizeSearch(e.title || '')
        const titleEn = normalizeSearch(e.title_en || '')
        return title.includes(q) || titleEn.includes(q)
      })
    }

    return [...result].sort((a, b) => {
      if (sortMode === 'title') return a.title.localeCompare(b.title, 'it')
      if (sortMode === 'rating') return (b.rating || 0) - (a.rating || 0)
      if (sortMode === 'progress') return getProgressRatio(b) - getProgressRatio(a)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [entries, activeType, activeStatus, searchTerm, sortMode])

  const hasActiveFilters = activeType !== 'all' || activeStatus !== 'all' || searchTerm.trim().length > 0

  const resetFilters = () => {
    setActiveType('all')
    setActiveStatus('all')
    setSearchTerm('')
  }

  const stats = useMemo(() => ({
    total: entries.length,
    completed: entries.filter(e => e.status === 'completed').length,
    inProgress: entries.filter(e => e.status === 'watching' || e.status === 'reading').length,
  }), [entries])

  const grouped = useMemo((): { status: string; items: MediaEntry[] }[] => {
    if (activeStatus !== 'all') return [{ status: activeStatus, items: filtered }]
    const order = ['watching', 'reading', 'completed', 'paused', 'dropped', 'planning']
    const groups: Record<string, MediaEntry[]> = {}
    for (const e of filtered) {
      const key = e.status || 'planning'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return order.filter(k => groups[k]?.length).map(k => ({ status: k, items: groups[k] }))
  }, [filtered, activeStatus])

  function openDrawer(entry: MediaEntry) {
    setDrawerMedia({
      id: entry.external_id || entry.id,
      title: entry.title,
      title_en: entry.title_en,
      type: entry.type,
      coverImage: entry.cover_image,
      episodes: entry.episodes,
      genres: entry.genres,
      source: 'anilist' as any,
    })
  }

  const gridItems = useMemo(() => filtered.map(toRailItem), [filtered])

  return (
    <PageScaffold
      title="Libreria"
      description="Tutto quello che stai guardando, leggendo, giocando o hai completato."
      icon={<BookOpen size={16} />}
      contentClassName="max-w-screen-lg pt-2 md:pt-8 pb-28"
    >
      {/* Hero stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Totale', value: stats.total },
          { label: 'Completati', value: stats.completed },
          { label: 'In corso', value: stats.inProgress },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 text-center bg-[var(--bg-card)] border border-[var(--border)]">
            <p className="text-[26px] font-bold leading-none mb-1 font-mono-data text-[var(--accent)]">{s.value}</p>
            <p className="gk-label">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 mb-6">
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Cerca nella tua libreria..."
        />
        <FilterBar
          items={TYPES}
          activeId={activeType}
          onChange={(id) => setActiveType(id)}
        />
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <FilterBar
              items={STATUS_FILTERS}
              activeId={activeStatus}
              onChange={(id) => setActiveStatus(id)}
              className="mx-0 px-0"
              chipClassName="h-7 px-3 text-[11px]"
            />
          </div>
          <SortSelect
            value={sortMode}
            options={SORT_OPTIONS}
            onChange={setSortMode}
            className="flex-shrink-0"
          />
          <ViewToggle
            value={viewMode}
            options={VIEW_OPTIONS}
            onChange={setViewMode}
            className="flex-shrink-0"
          />
        </div>
      </div>

      {!loading && entries.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2">
          <p className="font-mono-data text-[11px] text-[var(--text-muted)]">
            <span className="font-bold text-[var(--text-secondary)]">{filtered.length}</span> di {entries.length} elementi
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-bold text-[var(--accent)] transition-opacity hover:opacity-80"
            >
              Azzera filtri
            </button>
          )}
        </div>
      )}

      {loading ? (
        viewMode === 'grid' ? (
          <MediaGridSkeleton count={15} showMeta />
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl animate-pulse bg-[var(--bg-card)]" />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="gk-headline mb-1 text-[var(--text-primary)]">
            {entries.length === 0 ? 'Libreria vuota' : 'Nessun elemento trovato'}
          </p>
          <p className="gk-body mb-6">
            {entries.length === 0
              ? 'Aggiungi media dalla sezione Scopri'
              : searchTerm
              ? 'Prova con un titolo diverso o cancella la ricerca'
              : 'Prova a cambiare i filtri'}
          </p>
          {entries.length === 0 ? (
            <ActionButton href="/discover">Vai a Scopri</ActionButton>
          ) : hasActiveFilters ? (
            <ActionButton variant="secondary" onClick={resetFilters}>Azzera filtri</ActionButton>
          ) : null}
        </div>
      ) : viewMode === 'grid' ? (
        <MediaGrid
          items={gridItems}
          showMetaRow
          onItemClick={(item) => {
            const entry = filtered.find(e => e.id === item.id)
            if (entry) openDrawer(entry)
          }}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(({ status, items }) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="gk-label">{getMediaStatusLabel(status)}</h2>
                <span className="font-mono-data text-[12px] text-[var(--text-muted)]">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => openDrawer(entry)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors hover:opacity-90 active:scale-[0.99] bg-[var(--bg-card)] border border-[var(--border)]"
                  >
                    <div className="w-10 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)]">
                      {entry.cover_image ? (
                        <img src={entry.cover_image} alt={entry.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] font-display font-bold">
                          {entry.title.slice(0, 1)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold leading-tight line-clamp-1 mb-1 text-[var(--text-primary)]">
                        {entry.title}
                      </p>
                      <MediaMetaRow
                        type={entry.type}
                        status={entry.status || 'planning'}
                        score={entry.rating}
                        progress={entry.episodes && entry.episodes > 0
                          ? { current: entry.current_episode || 0, total: entry.episodes }
                          : undefined}
                        trailing={(
                          <span className="text-[11px] font-semibold" style={{ color: getMediaTypeColor(entry.type) }}>
                            {getMediaTypeLabel(entry.type)}
                          </span>
                        )}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <MediaDetailsDrawer
        media={drawerMedia}
        onClose={() => setDrawerMedia(null)}
      />
    </PageScaffold>
  )
}
