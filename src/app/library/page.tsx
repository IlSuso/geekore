'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { BookOpen, LayoutGrid, List, Search, X, Star } from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { PageScaffold } from '@/components/ui/PageScaffold'
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

const TYPES = [
  { id: 'all', label: 'Tutto' },
  { id: 'watching', label: 'In corso' },
  { id: 'completed', label: 'Completati' },
  { id: 'planning', label: 'Wishlist' },
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

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
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

function isStatusFilter(id: string): boolean {
  return ['watching', 'reading', 'completed', 'planning', 'paused', 'dropped'].includes(id)
}

function LibraryStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className={`font-mono-data mb-1 text-[28px] font-bold leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </p>
      <p className="gk-label">{label}</p>
    </div>
  )
}

export default function LibraryPage() {
  const router = useRouter()
  const authUser = useUser()
  const supabase = createClient()
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
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
    const query = normalize(searchTerm)
    let result = entries

    if (activeFilter !== 'all') {
      if (isStatusFilter(activeFilter)) {
        result = result.filter(e => (e.status || 'planning') === activeFilter)
      } else {
        result = result.filter(e => e.type === activeFilter)
      }
    }

    if (query) {
      result = result.filter(e => {
        const haystack = [
          e.title,
          e.title_en || '',
          e.type,
          ...(e.genres || []),
          getMediaStatusLabel(e.status || 'planning'),
        ].map(normalize).join(' ')
        return haystack.includes(query)
      })
    }
    return result
  }, [entries, activeFilter, searchTerm])

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const rated = entries.filter(e => typeof e.rating === 'number')
    const averageRating = rated.length
      ? rated.reduce((sum, e) => sum + Number(e.rating || 0), 0) / rated.length
      : 0

    return {
      total: entries.length,
      thisYear: entries.filter(e => new Date(e.updated_at).getFullYear() === currentYear).length,
      inProgress: entries.filter(e => e.status === 'watching' || e.status === 'reading').length,
      averageRating,
    }
  }, [entries])

  const grouped = useMemo((): { status: string; items: MediaEntry[] }[] => {
    if (activeFilter !== 'all' && isStatusFilter(activeFilter)) return [{ status: activeFilter, items: filtered }]
    const order = ['watching', 'reading', 'completed', 'planning', 'paused', 'dropped']
    const groups: Record<string, MediaEntry[]> = {}
    for (const e of filtered) {
      const key = e.status || 'planning'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return order.filter(k => groups[k]?.length).map(k => ({ status: k, items: groups[k] }))
  }, [filtered, activeFilter])

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
  const hasActiveFilters = activeFilter !== 'all' || searchTerm.trim().length > 0

  return (
    <PageScaffold
      title="Library"
      description="La tua collezione viva: progressi, completati, wishlist e voto medio in un unico spazio compatto."
      icon={<BookOpen size={16} />}
      contentClassName="max-w-screen-lg pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(230,255,61,0.035))] p-4 md:p-5">
        <p className="gk-label mb-2 text-[var(--accent)]">Il tuo archivio geek</p>
        <h1 className="gk-h1 mb-2">Library compatta, non vetrina.</h1>
        <p className="gk-body max-w-2xl">
          Il valore centrale di Geekore è qui: tutto quello che consumi, organizzato per stato e medium, senza poster giganti inutili.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <LibraryStat label="Totali" value={stats.total} accent />
        <LibraryStat label="Quest’anno" value={stats.thisYear} />
        <LibraryStat label="In corso" value={stats.inProgress} />
        <LibraryStat label="Media voto" value={stats.averageRating ? stats.averageRating.toFixed(1) : '—'} />
      </div>

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cerca titolo, genere, medium..."
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pl-10 pr-10 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              aria-label="Cancella ricerca libreria"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <FilterBar
              items={TYPES}
              activeId={activeFilter}
              onChange={(id) => setActiveFilter(id)}
              className="mx-0 px-0"
              chipClassName="h-8 px-3 text-[12px]"
            />
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="rounded-lg p-1.5 transition-all"
              style={{ background: viewMode === 'list' ? 'var(--accent)' : 'transparent' }}
              aria-label="Vista lista"
            >
              <List size={14} style={{ color: viewMode === 'list' ? '#0B0B0F' : 'var(--text-muted)' }} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className="rounded-lg p-1.5 transition-all"
              style={{ background: viewMode === 'grid' ? 'var(--accent)' : 'transparent' }}
              aria-label="Vista griglia"
            >
              <LayoutGrid size={14} style={{ color: viewMode === 'grid' ? '#0B0B0F' : 'var(--text-muted)' }} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        viewMode === 'grid' ? (
          <MediaGridSkeleton count={15} showMeta />
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[74px] rounded-2xl bg-[var(--bg-card)] skeleton" />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <p className="gk-headline mb-1 text-[var(--text-primary)]">
            {entries.length === 0 ? 'Library vuota' : 'Nessun elemento trovato'}
          </p>
          <p className="gk-body mb-6">
            {entries.length === 0
              ? 'Aggiungi media dalla sezione Discover'
              : hasActiveFilters
                ? 'Prova a cambiare ricerca o filtri'
                : 'Prova a cambiare i filtri'}
          </p>
          {entries.length === 0 ? (
            <ActionButton href="/discover">Vai a Discover</ActionButton>
          ) : hasActiveFilters ? (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setActiveFilter('all') }}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[#0B0B0F] transition-transform hover:scale-[1.02]"
            >
              Cancella filtri
            </button>
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
        <div className="space-y-7">
          {grouped.map(({ status, items }) => (
            <section key={status}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="gk-label">{getMediaStatusLabel(status)}</h2>
                <span className="gk-mono text-[var(--text-muted)]">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.map(entry => {
                  const color = TYPE_COLORS[entry.type] || 'var(--border)'
                  return (
                    <CompactMediaRow
                      key={entry.id}
                      title={entry.title}
                      type={entry.type}
                      coverImage={entry.cover_image}
                      status={entry.status || 'planning'}
                      score={entry.rating}
                      progress={entry.episodes && entry.episodes > 0
                        ? { current: entry.current_episode || 0, total: entry.episodes }
                        : undefined}
                      trailing={(
                        <div className="flex min-w-[54px] flex-col items-end gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                          {typeof entry.rating === 'number' ? (
                            <span className="inline-flex items-center gap-1 font-mono-data text-[12px] font-bold text-[var(--text-primary)]">
                              <Star size={11} className="text-[var(--accent)]" fill="var(--accent)" />
                              {entry.rating}
                            </span>
                          ) : (
                            <span className="gk-mono text-[var(--text-muted)]">—</span>
                          )}
                        </div>
                      )}
                      onClick={() => openDrawer(entry)}
                    />
                  )
                })}
              </div>
            </section>
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
