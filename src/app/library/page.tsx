'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import {
  Film, Tv, Gamepad2, Swords, Layers, Dices,
  Star, Clock, CheckCircle, BookOpen, PauseCircle, XCircle,
  LayoutGrid, List,
} from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'

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

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Swords, manga: Layers, movie: Film, tv: Tv, game: Gamepad2, boardgame: Dices,
}
const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV', game: 'Gioco', boardgame: 'Board',
}
const TYPE_COLOR: Record<string, string> = {
  anime: 'var(--type-anime)', manga: 'var(--type-manga)', movie: 'var(--type-movie)',
  tv: 'var(--type-tv)', game: 'var(--type-game)', boardgame: 'var(--type-board)',
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  watching:  { label: 'In corso',     icon: Clock,        color: 'text-sky-400' },
  completed: { label: 'Completato',   icon: CheckCircle,  color: 'text-emerald-400' },
  paused:    { label: 'In pausa',     icon: PauseCircle,  color: 'text-amber-400' },
  dropped:   { label: 'Abbandonato', icon: XCircle,      color: 'text-red-400' },
  reading:   { label: 'In lettura',  icon: BookOpen,     color: 'text-sky-400' },
  planning:  { label: 'Pianificato', icon: Star,         color: 'text-zinc-400' },
}

const STATUS_ICON_MAP: Record<string, React.ElementType> = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.icon])
)

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

export default function LibraryPage() {
  const router = useRouter()
  const authUser = useUser()
  const supabase = createClient()
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('all')
  const [activeStatus, setActiveStatus] = useState('all')
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
    let result = activeType === 'all' ? entries : entries.filter(e => e.type === activeType)
    if (activeStatus !== 'all') result = result.filter(e => e.status === activeStatus)
    return result
  }, [entries, activeType, activeStatus])

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

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="max-w-screen-lg mx-auto px-4 pt-2 md:pt-8">

        {/* Hero stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Totale', value: stats.total },
            { label: 'Completati', value: stats.completed },
            { label: 'In corso', value: stats.inProgress },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-[26px] font-bold leading-none mb-1 font-mono" style={{ color: '#E6FF3D' }}>{s.value}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Type filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none mb-3">
          {TYPES.map(t => {
            const isActive = activeType === t.id
            const color = t.id !== 'all' ? TYPE_COLOR[t.id] : undefined
            return (
              <button
                key={t.id}
                onClick={() => setActiveType(t.id)}
                className="flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                style={{
                  background: isActive ? (color || '#E6FF3D') : 'var(--bg-card)',
                  color: isActive ? (color ? '#fff' : '#0B0B0F') : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? (color || '#E6FF3D') : 'var(--border)'}`,
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Status filter + view toggle row */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-1">
            {STATUS_FILTERS.map(s => {
              const isActive = activeStatus === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStatus(s.id)}
                  className="flex-shrink-0 px-3 py-1 rounded-xl text-[11px] font-semibold transition-all"
                  style={{
                    background: isActive ? 'rgba(230,255,61,0.12)' : 'transparent',
                    color: isActive ? '#E6FF3D' : 'var(--text-muted)',
                    border: `1px solid ${isActive ? 'rgba(230,255,61,0.4)' : 'transparent'}`,
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>

          {/* View toggle */}
          <div className="flex-shrink-0 flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => setViewMode('list')}
              className="p-1.5 rounded-lg transition-all"
              style={{ background: viewMode === 'list' ? '#E6FF3D' : 'transparent' }}
            >
              <List size={14} style={{ color: viewMode === 'list' ? '#0B0B0F' : 'var(--text-muted)' }} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className="p-1.5 rounded-lg transition-all"
              style={{ background: viewMode === 'grid' ? '#E6FF3D' : 'transparent' }}
            >
              <LayoutGrid size={14} style={{ color: viewMode === 'grid' ? '#0B0B0F' : 'var(--text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-xl animate-pulse" style={{ background: 'var(--bg-card)' }} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--bg-card)' }} />
              ))}
            </div>
          )
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {entries.length === 0 ? 'Libreria vuota' : 'Nessun elemento trovato'}
            </p>
            <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
              {entries.length === 0 ? 'Aggiungi media dalla sezione Scopri' : 'Prova a cambiare i filtri'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* ── GRID VIEW ─────────────────────────────── */
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {filtered.map(entry => {
              const TypeIcon = TYPE_ICON[entry.type] || Film
              const typeColor = TYPE_COLOR[entry.type]
              const StatusIcon = entry.status ? STATUS_ICON_MAP[entry.status] : null
              return (
                <button
                  key={entry.id}
                  onClick={() => openDrawer(entry)}
                  className="relative group aspect-[2/3] rounded-xl overflow-hidden text-left"
                  style={{ background: 'var(--bg-card)' }}
                >
                  {entry.cover_image ? (
                    <img src={entry.cover_image} alt={entry.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                      <TypeIcon size={24} style={{ color: typeColor }} />
                      <p className="text-[10px] font-mono text-center leading-tight line-clamp-3" style={{ color: 'var(--text-muted)' }}>
                        {entry.title}
                      </p>
                    </div>
                  )}

                  {/* Type color strip */}
                  <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: typeColor }} />

                  {/* Rating badge */}
                  {entry.rating && (
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(0,0,0,0.75)' }}>
                      <Star size={9} fill="#E6FF3D" color="#E6FF3D" />
                      <span className="text-[10px] font-bold font-mono text-white">{entry.rating}</span>
                    </div>
                  )}

                  {/* Status icon */}
                  {StatusIcon && (
                    <div className="absolute top-1.5 left-1.5 p-1 rounded-md" style={{ background: 'rgba(0,0,0,0.65)' }}>
                      <StatusIcon size={10} className={STATUS_CONFIG[entry.status!]?.color || 'text-zinc-400'} />
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <p className="text-[10px] font-semibold text-white leading-tight line-clamp-3">{entry.title}</p>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          /* ── LIST VIEW ─────────────────────────────── */
          <div className="space-y-8">
            {grouped.map(({ status, items }) => {
              const cfg = STATUS_CONFIG[status] || { label: status, icon: Star, color: 'text-zinc-400' }
              const Icon = cfg.icon
              return (
                <div key={status}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={14} className={cfg.color} />
                    <h2 className="text-[13px] font-bold" style={{ color: 'var(--text-secondary)' }}>{cfg.label}</h2>
                    <span className="text-[12px] font-mono" style={{ color: 'var(--text-muted)' }}>{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map(entry => {
                      const TypeIcon = TYPE_ICON[entry.type] || Film
                      const typeColor = TYPE_COLOR[entry.type]
                      const hasProgress = (entry.status === 'watching' || entry.status === 'reading') && entry.episodes && entry.episodes > 0
                      const pct = hasProgress ? Math.min(100, Math.round((entry.current_episode / entry.episodes!) * 100)) : 0
                      return (
                        <button
                          key={entry.id}
                          onClick={() => openDrawer(entry)}
                          className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors hover:opacity-90 active:scale-[0.99]"
                          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
                        >
                          {/* Cover */}
                          <div className="w-10 h-14 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
                            {entry.cover_image ? (
                              <img src={entry.cover_image} alt={entry.title} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <TypeIcon size={18} style={{ color: 'var(--text-muted)' }} />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold leading-tight line-clamp-1 mb-0.5" style={{ color: 'var(--text-primary)' }}>
                              {entry.title}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold" style={{ color: typeColor }}>
                                {TYPE_LABEL[entry.type] || entry.type}
                              </span>
                              {hasProgress && (
                                <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                  {entry.current_episode}/{entry.episodes}
                                </span>
                              )}
                            </div>
                            {hasProgress && (
                              <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: typeColor }} />
                              </div>
                            )}
                          </div>

                          {/* Rating */}
                          {entry.rating ? (
                            <div className="flex-shrink-0 flex items-center gap-0.5">
                              <Star size={12} style={{ color: '#E6FF3D' }} fill="#E6FF3D" />
                              <span className="text-[12px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                                {entry.rating}
                              </span>
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <MediaDetailsDrawer
        media={drawerMedia}
        onClose={() => setDrawerMedia(null)}
      />
    </div>
  )
}
