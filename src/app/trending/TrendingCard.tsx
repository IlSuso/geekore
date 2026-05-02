'use client'
// src/app/trending/TrendingCard.tsx
// Client Component — necessario per onError handler sulle immagini

import { Film, Gamepad2, Tv, Medal, Star, Users, Layers, Dice5 } from 'lucide-react'
import type { TrendingItem } from './page'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film,
  manga: Layers,
  game: Gamepad2,
  tv: Tv,
  movie: Film,
  boardgame: Dice5,
}

export function TrendingCard({ item, rank }: { item: TrendingItem; rank: number }) {
  const Icon = TYPE_ICON[item.type] || Film
  const medalClass = rank === 0 ? 'text-yellow-300' : rank === 1 ? 'text-zinc-300' : rank === 2 ? 'text-amber-600' : 'text-[var(--text-muted)]'

  return (
    <div className="group flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
        {rank < 3
          ? <Medal size={18} className={medalClass} />
          : <span className="font-mono-data text-xs font-black text-[var(--text-muted)]">#{rank + 1}</span>}
      </div>

      <div className="h-[72px] w-12 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
        {item.cover_image ? (
          <img
            src={item.cover_image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading={rank < 8 ? 'eager' : 'lazy'}
            fetchPriority={rank < 4 ? 'high' : 'auto'}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon size={20} className="text-[var(--text-muted)]" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <MediaTypeBadge type={item.type} size="xs" />
        </div>
        <p className="line-clamp-1 text-[14px] font-bold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
          {item.title}
        </p>
        <p className="gk-mono mt-1 text-[var(--text-muted)]">community signal</p>
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300">
          <Users size={11} />
          <span className="font-mono-data text-[11px] font-black">{item.count}</span>
        </div>
        {item.avg_rating != null && (
          <div className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-yellow-300">
            <Star size={11} fill="currentColor" />
            <span className="font-mono-data text-[11px] font-black">{item.avg_rating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  )
}