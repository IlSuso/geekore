'use client'

import { useState, useEffect } from 'react'
import { Gamepad2, Film, Tv, BookOpen, Loader2, CalendarDays, RefreshCw, Swords } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { translateGenre } from '@/lib/genres'
import { ErrorState } from '@/components/ui/ErrorState'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'

// Cache in-memory: sopravvive alle navigazioni SPA ma si svuota al reload
const newsCache = new Map<string, { data: any[]; ts: number }>()
const NEWS_CACHE_TTL = 5 * 60 * 1000

type UpcomingItem = {
  id?: string
  type?: string
  source_api?: 'tmdb' | 'anilist' | 'igdb'
  title: string
  description?: string
  coverImage?: string
  date?: string
  year?: number
  genres?: string[]
  score?: number
  episodes?: number
  studios?: string[]
  developers?: string[]
  original_language?: string
  category: 'gaming' | 'cinema' | 'anime' | 'tv'
  source: string
  nextEpisode?: number
  platforms?: string[]
  duration?: number
  format?: string
  mechanics?: string[]
  themes?: string[]
  directors?: string[]
  totalSeasons?: number
  seasons?: Record<number, { episode_count: number }>
  playing_time?: number
  cast?: string[]
  watchProviders?: string[]
  nextEpisodeDate?: string
  italianSupportTypes?: string[]
}

const CATEGORY_COLORS: Record<string, string> = {
  cinema: 'bg-red-600 text-white',
  tv:     'bg-purple-600 text-white',
  anime:  'bg-orange-500 text-white',
  gaming: 'bg-emerald-600 text-white',
}

function formatDate(dateStr?: string, locale?: string) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString(locale === 'en' ? 'en-US' : 'it-IT', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return null }
}

function toMediaDetails(item: UpcomingItem): MediaDetails | null {
  if (!item.id || !item.type) return null
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    coverImage: item.coverImage,
    year: item.year,
    description: item.description,
    genres: item.genres || [],
    score: item.score,
    episodes: item.episodes,
    studios: item.studios,
    developers: item.developers,
    directors: item.directors,
    cast: item.cast,
    platforms: item.platforms,
    playing_time: item.playing_time ?? item.duration,
    mechanics: item.mechanics,
    themes: item.themes,
    totalSeasons: item.totalSeasons,
    seasons: item.seasons,
    watchProviders: item.watchProviders,
    italianSupportTypes: item.italianSupportTypes,
    // source non passato intenzionalmente: sopprime il link esterno nel drawer
  }
}

export default function NewsPage() {
  const { locale, t } = useLocale()
  const [activeCategory, setActiveCategory] = useState('all')
  const [items, setItems] = useState<UpcomingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [drawerMedia, setDrawerMedia] = useState<MediaDetails | null>(null)

  const CATEGORIES = [
    { id: 'all',    label: t.news.all,    icon: null      },
    { id: 'cinema', label: t.news.cinema, icon: Film      },
    { id: 'tv',     label: t.news.tv,     icon: Tv        },
    { id: 'anime',  label: t.news.anime,  icon: BookOpen  },
    { id: 'gaming', label: t.news.gaming, icon: Gamepad2  },
  ]

  const CATEGORY_LABELS: Record<string, string> = {
    cinema: t.news.cinema,
    tv:     t.news.tv,
    anime:  t.news.anime,
    gaming: t.news.gaming,
  }

  const CATEGORY_ICONS: Record<string, React.ElementType> = {
    cinema: Film,
    tv:     Tv,
    anime:  Swords,
    gaming: Gamepad2,
  }

  const fetchItems = async (cat: string, forceRefresh = false) => {
    const cacheKey = `${cat}-${locale}`
    if (!forceRefresh) {
      const cached = newsCache.get(cacheKey)
      if (cached && Date.now() - cached.ts < NEWS_CACHE_TTL) {
        setItems(cached.data)
        setLoading(false)
        setFetchError(false)
        return
      }
    }
    setLoading(true)
    setFetchError(false)
    try {
      const res = await fetch(`/api/news?cat=${cat}&lang=${locale}`)
      if (!res.ok) {
        setFetchError(true)
        setItems([])
      } else {
        const data = await res.json()
        const list = Array.isArray(data) ? data : []
        setItems(list)
        newsCache.set(cacheKey, { data: list, ts: Date.now() })
        // Cache vecchia (senza id): triggera sync in background e invalida cache
        if (list.some((i: any) => !i.id)) {
          newsCache.delete(cacheKey)
          fetch(`/api/news/sync?lang=${locale}`, { method: 'GET' }).catch(() => {})
        }
      }
    } catch {
      setFetchError(true)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchItems(activeCategory)
  }, [activeCategory, locale])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch(`/api/news/sync?lang=${locale}`, { method: 'GET' })
      await fetchItems(activeCategory, true)
      setLastSync(new Date().toLocaleTimeString(locale === 'en' ? 'en-US' : 'it-IT', {
        hour: '2-digit', minute: '2-digit',
      }))
    } catch {}
    setSyncing(false)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-2 md:pt-8 pb-24 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="hidden md:block text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400 mb-2">
                {t.news.title}
              </h1>
              <p className="text-zinc-500 text-sm">{t.news.subtitle}</p>
            </div>
            <button
              onClick={triggerSync}
              disabled={syncing}
              title={t.news.refresh}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl text-sm text-zinc-400 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {lastSync ? `${t.news.updated} ${lastSync}` : t.news.refresh}
            </button>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const active = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {Icon && <Icon size={14} />}
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 size={32} className="animate-spin text-violet-400" />
          </div>
        ) : fetchError ? (
          <ErrorState
            error="Non è stato possibile recuperare i contenuti. Controlla la connessione e riprova."
            onRetry={() => fetchItems(activeCategory)}
          />
        ) : items.length === 0 ? (
          <div className="text-center py-32">
            <p className="text-zinc-500 mb-4">{t.news.empty}</p>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="px-3 sm:px-4 md:px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm font-semibold transition disabled:opacity-50"
            >
              {syncing ? t.news.loading : t.news.load}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item, i) => {
              const media = toMediaDetails(item)
              const CategoryIcon = CATEGORY_ICONS[item.category]
              return (
                <div
                  key={item.id || i}
                  onClick={() => media && setDrawerMedia(media)}
                  className={`group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all duration-300 hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-500/10 hover:-translate-y-0.5 flex flex-col ${media ? 'cursor-pointer' : ''}`}
                >
                  <div className="relative aspect-[2/3] bg-zinc-800 flex-shrink-0 overflow-hidden">
                    {item.coverImage ? (
                      <img
                        src={item.coverImage}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <Film size={36} />
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                    <div className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg flex items-center gap-1 ${CATEGORY_COLORS[item.category] || 'bg-zinc-700 text-zinc-300'}`}>
                      {CategoryIcon && <CategoryIcon size={9} />}
                      {CATEGORY_LABELS[item.category] || item.category}
                    </div>
                  </div>

                  <div className="p-3 flex flex-col flex-1 gap-1.5">
                    <h3 className="font-semibold text-xs leading-snug line-clamp-2 text-white group-hover:text-violet-300 transition-colors">
                      {item.title}
                    </h3>
                    {item.genres && item.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.genres.slice(0, 2).map(g => (
                          <span key={g} className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                            {translateGenre(g)}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.category === 'gaming' && item.italianSupportTypes && item.italianSupportTypes.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-zinc-500">🇮🇹</span>
                        <span className="text-[9px] text-zinc-500">{item.italianSupportTypes.join(' · ')}</span>
                      </div>
                    )}
                    <div className="mt-auto pt-1">
                      {item.nextEpisodeDate ? (
                        <div className="flex items-center gap-1 text-[11px] text-violet-400 font-medium">
                          <CalendarDays size={10} />
                          {formatDate(item.nextEpisodeDate, locale)}
                        </div>
                      ) : item.date ? (
                        <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-medium">
                          <CalendarDays size={10} />
                          {formatDate(item.date, locale)}
                        </div>
                      ) : item.nextEpisode ? (
                        <span className="text-[11px] text-emerald-400 font-medium">
                          {t.news.episode(item.nextEpisode)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {drawerMedia && (
        <MediaDetailsDrawer
          media={drawerMedia}
          onClose={() => setDrawerMedia(null)}
          onAdd={() => setDrawerMedia(null)}
        />
      )}
    </div>
  )
}
