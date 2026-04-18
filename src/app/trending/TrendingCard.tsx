'use client'
// src/app/trending/TrendingCard.tsx
// Client Component — necessario per onError handler sulle immagini

import { Film, BookOpen, Gamepad2, Tv, Trophy, Star, Users, Layers } from 'lucide-react'
import type { TrendingItem } from './page'

const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: Layers, game: Gamepad2,
  tv: Tv, movie: Film,
}

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco',
  tv: 'Serie TV', movie: 'Film',
}

export function TrendingCard({ item, rank }: { item: TrendingItem; rank: number }) {
  const Icon = TYPE_ICON[item.type] || Film
  const medalColor = rank === 0 ? 'text-yellow-400' : rank === 1 ? 'text-zinc-300' : rank === 2 ? 'text-amber-600' : null

  return (
    <div className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors">
      {/* Rank */}
      <div className="w-8 text-center flex-shrink-0">
        {medalColor ? (
          <Trophy size={18} className={medalColor} />
        ) : (
          <span className="text-sm font-bold text-zinc-600">#{rank + 1}</span>
        )}
      </div>

      {/* Cover */}
      <div className="w-12 h-16 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
        {item.cover_image ? (
          <img
            src={item.cover_image}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <Icon size={20} className="text-zinc-600" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm leading-tight truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${TYPE_COLOR[item.type] || 'bg-zinc-700'}`}>
            {TYPE_LABEL[item.type] || item.type}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="text-right flex-shrink-0 space-y-1">
        <div className="flex items-center gap-1 justify-end text-emerald-400">
          <Users size={11} />
          <span className="text-xs font-bold">{item.count}</span>
        </div>
        {item.avg_rating != null && (
          <div className="flex items-center gap-1 justify-end text-yellow-400">
            <Star size={11} fill="currentColor" />
            <span className="text-xs font-bold">{item.avg_rating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
