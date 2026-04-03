'use client'

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import AppShell from '@/components/layout/AppShell'
import { MediaBadge } from '@/components/ui/MediaBadge'
import { MediaType } from '@/types'
import { mediaColor } from '@/lib/utils'

const FILTER_TYPES: { type: MediaType | 'all'; label: string }[] = [
  { type: 'all',   label: 'Tutto' },
  { type: 'anime', label: 'Anime' },
  { type: 'manga', label: 'Manga' },
  { type: 'game',  label: 'Giochi' },
  { type: 'board', label: 'Board' },
]

const TRENDING = [
  { id: '1', type: 'anime' as MediaType, title: 'Solo Leveling', cover: 'https://cdn.anilist.co/img/dir/anime/reg/166240.jpg' },
  { id: '2', type: 'game'  as MediaType, title: 'Cyberpunk 2077', cover: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/library_600x900.jpg' },
  { id: '3', type: 'manga' as MediaType, title: 'Jujutsu Kaisen', cover: 'https://cdn.anilist.co/img/dir/manga/reg/113138.jpg' },
  { id: '4', type: 'anime' as MediaType, title: 'Dungeon Meshi', cover: 'https://cdn.anilist.co/img/dir/anime/reg/163059.jpg' },
  { id: '5', type: 'game'  as MediaType, title: 'Baldur\'s Gate 3', cover: 'https://cdn.akamai.steamstatic.com/steam/apps/1086940/library_600x900.jpg' },
  { id: '6', type: 'board' as MediaType, title: 'Wingspan', cover: 'https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__imagepage/img/pVjty2FHKQ4ANFexivtL0xF-M0I=/fit-in/900x600/filters:no_upscale():strip_icc()/pic4458123.jpg' },
]

export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MediaType | 'all'>('all')

  const filtered = TRENDING.filter(
    (item) => filter === 'all' || item.type === filter
  )

  return (
    <AppShell>
      <header className="px-4 pt-safe py-4">
        <h2 className="font-display text-xl font-bold text-white mb-4">Scopri</h2>

        {/* Search bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca anime, manga, giochi..."
            className="w-full rounded-xl border border-white/[0.08] bg-bg-card pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-accent/40 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-none">
        {FILTER_TYPES.map(({ type, label }) => {
          const active = filter === type
          const color = type !== 'all' ? mediaColor(type as MediaType) : '#7c6af7'
          return (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all"
              style={active
                ? { background: `${color}20`, color, border: `1px solid ${color}40` }
                : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Trending grid */}
      <div className="px-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/25 mb-3">
          Trending ora
        </p>
        <div className="grid grid-cols-3 gap-2">
          {filtered.map(({ id, type, title, cover }) => (
            <button key={id} className="group relative rounded-xl overflow-hidden bg-bg-card aspect-[2/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt={title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-2 right-2">
                <MediaBadge type={type} className="mb-1" />
                <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">
                  {title}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
