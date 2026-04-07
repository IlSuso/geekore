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
  cinema: 'bg-red-600 text-white',
  tv:     'bg-purple-600 text-white',
  anime:  'bg-orange-500 text-white',
  gaming: 'bg-emerald-600 text-white',
}

const CATEGORY_LABELS: Record<string, string> = {
  cinema: 'Film',
  tv:     'Serie',
  anime:  'Anime',
  gaming: 'Game',
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {news.map((item, i) => (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-violet-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/10 hover:-translate-y-0.5 flex flex-col"
              >
                {/* Cover */}
                <div className="relative aspect-[2/3] bg-zinc-800 flex-shrink-0 overflow-hidden">
                  {item.coverImage ? (
                    <img
                      src={item.coverImage}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <Film size={36} />
                    </div>
                  )}
                  {/* Gradient bottom */}
                  <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                  {/* Category badge */}
                  <div className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-lg ${CATEGORY_COLORS[item.category] || 'bg-zinc-700 text-zinc-300'}`}>
                    {CATEGORY_LABELS[item.category] || item.category}
                  </div>
                  {/* External link icon on hover */}
                  <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-black/60 backdrop-blur-sm p-1 rounded-lg">
                      <ExternalLink size={11} className="text-white" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3 flex flex-col flex-1 gap-1.5">
                  <h3 className="font-semibold text-xs leading-snug line-clamp-2 text-white group-hover:text-violet-300 transition-colors">
                    {item.title}
                  </h3>

                  {item.description && (
                    <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed flex-1">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-auto pt-1">
                    {item.date ? (
                      <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-medium">
                        <CalendarDays size={10} />
                        {formatDate(item.date)}
                      </div>
                    ) : item.nextEpisode ? (
                      <span className="text-[11px] text-emerald-400 font-medium">Ep. {item.nextEpisode} in arrivo</span>
                    ) : null}
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
