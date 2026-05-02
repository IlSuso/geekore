'use client'
// src/app/trending/TrendingCard.tsx
// Client Component — necessario per onError handler sulle immagini

import Link from 'next/link'
import { Film, Gamepad2, Tv, Medal, Star, Users, Layers, Dice5, TrendingUp } from 'lucide-react'
import type { TrendingItem } from './page'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film,
  manga: Layers,
  game: Gamepad2,
  tv: Tv,
  movie: Film,
  boardgame: Dice5,
  board_game: Dice5,
}

function normalizeType(type: string): string {
  return type === 'board_game' ? 'boardgame' : type
}

function discoverHref(item: TrendingItem): string {
  const type = normalizeType(item.type)
  const q = item.title || item.external_id || ''
  return `/discover?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`
}

export function TrendingCard({ item, rank }: { item: TrendingItem; rank: number }) {
  const type = normalizeType(item.type)
  const Icon = TYPE_ICON[type] || Film
  const medalClass = rank === 0 ? 'text-yellow-300' : rank === 1 ? 'text-zinc-300' : rank === 2 ? 'text-amber-600' : 'text-[var(--text-muted)]'
  const isPodium = rank < 3

  return (
    <Link
      href={discoverHref({ ...item, type })}
      data-no-swipe="true"
      className={`group flex items-center gap-3 rounded-[20px] border bg-[var(--bg-card)] p-2.5 transition-all hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${
        rank === 0
          ? 'border-[rgba(230,255,61,0.28)] shadow-[0_12px_42px_rgba(230,255,61,0.045)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
      }`}
      aria-label={`Apri ${item.title} in Discover`}
    >
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/5 ${isPodium ? 'bg-black/24' : 'bg-[var(--bg-secondary)]'}`}>
        {isPodium
          ? <Medal size={18} className={medalClass} />
          : <span className="font-mono-data text-xs font-black text-[var(--text-muted)]">#{rank + 1}</span>}
      </div>

      <div className="h-[88px] w-16 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
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
          <MediaTypeBadge type={type} size="xs" />
          {rank === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(230,255,61,0.26)] bg-[rgba(230,255,61,0.08)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
              <TrendingUp size={10} /> top
            </span>
          )}
        </div>
        <p className="line-clamp-1 text-[14px] font-bold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
          {item.title}
        </p>
        <p className="gk-mono mt-1 text-[var(--text-muted)]">apri in Discover</p>
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
    </Link>
  )
}
