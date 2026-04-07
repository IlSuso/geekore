'use client'

import { useState, useEffect } from 'react'
import { Gamepad2, Film, Tv, BookOpen, Loader2, ExternalLink, CalendarDays, RefreshCw } from 'lucide-react'

type NewsItem = {
  title: string
  description?: string
  coverImage?: string
  date?: string
  category: 'gaming' | 'cinema' | 'anime' | 'tv'
  source: string
  url: string
  nextEpisode?: number
}

const CATEGORIES = [
  { id: 'all',    label: 'Tutto',      icon: null },
  { id: 'cinema', label: 'Film',       icon: Film },
  { id: 'tv',     label: 'Serie TV',   icon: Tv },
  { id: 'anime',  label: 'Anime',      icon: BookOpen },
  { id: 'gaming', label: 'Videogiochi',icon: Gamepad2 },
]

const CATEGORY_COLORS: Record<string, string> = {
  cinema: 'bg-red-500/20 text-red-300 border-red-500/30',
  tv:     'bg-purple-500/20 text-purple-300 border-purple-500/30',
  anime:  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  gaming: 'bg-green-500/20 text-green-300 border-green-500/30',
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return null }
}

export default function NewsPage() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)

  const fetchNews = async (cat: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/news?cat=${cat}`)
      if (res.ok) {
        const data = await res.json()
        setNews(Array.isArray(data) ? data : [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    fetchNews(activeCategory)
  }, [activeCategory])

  const triggerSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/news/sync', { method: 'POST' })
      await fetchNews(activeCategory)
      setLastSync(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))
    } catch {}
    setSyncing(false)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-24 max-w-6xl mx-auto px-6">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400 mb-2">
                News
              </h1>
              <p className="text-zinc-400">
                Uscite imminenti e novità dall'universo nerd — dati da TMDb, AniList e IGDB
              </p>
            </div>
            <button
              onClick={triggerSync}
              disabled={syncing}
              title="Aggiorna notizie"
              className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl text-sm text-zinc-400 hover:text-white transition disabled:opacity-50"
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {lastSync ? `Aggiornato ${lastSync}` : 'Aggiorna'}
            </button>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-3 mb-10">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium transition ${
                  activeCategory === cat.id
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300'
                }`}
              >
                {Icon && <Icon size={16} />}
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
        ) : news.length === 0 ? (
          <div className="text-center py-32">
            <p className="text-zinc-500 mb-4">Nessuna notizia disponibile.</p>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm font-semibold transition disabled:opacity-50"
            >
              {syncing ? 'Caricamento...' : 'Carica notizie'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {news.map((item, i) => (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition-all hover:shadow-lg hover:shadow-violet-500/10 flex flex-col"
              >
                {/* Cover */}
                <div className="relative h-64 bg-zinc-900 flex-shrink-0 overflow-hidden">
                  {item.coverImage ? (
                    <img
                      src={item.coverImage}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700">
                      <Film size={40} />
                    </div>
                  )}
                  {/* Category badge */}
                  <div className={`absolute top-3 left-3 px-2 py-1 rounded-full text-[10px] font-bold border ${CATEGORY_COLORS[item.category] || 'bg-zinc-800 text-zinc-400'}`}>
                    {item.category === 'cinema' ? 'Film' : item.category === 'tv' ? 'Serie' : item.category === 'anime' ? 'Anime' : 'Game'}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2 mb-1 group-hover:text-violet-300 transition-colors">
                    {item.title}
                  </h3>

                  {item.description && (
                    <p className="text-xs text-zinc-500 line-clamp-2 mb-2 flex-1">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-2">
                    {item.date ? (
                      <div className="flex items-center gap-1 text-xs text-zinc-500">
                        <CalendarDays size={11} />
                        {formatDate(item.date)}
                      </div>
                    ) : item.nextEpisode ? (
                      <span className="text-xs text-emerald-400">Ep. {item.nextEpisode} in arrivo</span>
                    ) : (
                      <span className="text-xs text-zinc-600">{typeof item.source === 'string' ? item.source : (item.source as any)?.name || ''}</span>
                    )}
                    <ExternalLink size={11} className="text-zinc-600 group-hover:text-violet-400 transition-colors" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
