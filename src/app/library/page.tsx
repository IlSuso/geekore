'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { Film, Tv, Gamepad2, Swords, Layers, Dices, Star, Clock, CheckCircle, BookOpen, PauseCircle, XCircle } from 'lucide-react'
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
  watching:  { label: 'In corso',     icon: Clock,         color: 'text-sky-400' },
  completed: { label: 'Completato',   icon: CheckCircle,   color: 'text-emerald-400' },
  paused:    { label: 'In pausa',     icon: PauseCircle,   color: 'text-amber-400' },
  dropped:   { label: 'Abbandonato', icon: XCircle,       color: 'text-red-400' },
  reading:   { label: 'In lettura',  icon: BookOpen,      color: 'text-sky-400' },
  planning:  { label: 'Pianificato', icon: Star,          color: 'text-zinc-400' },
}

const TYPES = [
  { id: 'all', label: 'Tutto' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
  { id: 'game', label: 'Giochi' },
  { id: 'tv', label: 'Serie' },
  { id: 'movie', label: 'Film' },
  { id: 'boardgame', label: 'Board' },
]

export default function LibraryPage() {
  const router = useRouter()
  const authUser = useUser()
  const supabase = createClient()
  const [entries, setEntries] = useState<MediaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('all')
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

  const filtered = useMemo(() =>
    activeType === 'all' ? entries : entries.filter(e => e.type === activeType),
    [entries, activeType]
  )

  // Stats
  const stats = useMemo(() => ({
    total: entries.length,
    completed: entries.filter(e => e.status === 'completed').length,
    inProgress: entries.filter(e => e.status === 'watching' || e.status === 'reading').length,
  }), [entries])

  // Group by status
  const grouped = useMemo((): { status: string; items: MediaEntry[] }[] => {
    const order = ['watching', 'reading', 'completed', 'paused', 'dropped', 'planning']
    const groups: Record<string, MediaEntry[]> = {}
    for (const e of filtered) {
      const key = e.status || 'planning'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return order.filter(k => groups[k]?.length).map(k => ({ status: k, items: groups[k] }))
  }, [filtered])

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
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none mb-6">
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

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--bg-card)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[16px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {entries.length === 0 ? 'Libreria vuota' : 'Nessun elemento in questa categoria'}
            </p>
            <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
              Aggiungi media dalla sezione Scopri
            </p>
          </div>
        ) : (
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
