'use client'
// src/app/trending/TrendingCard.tsx
// Client Component — necessario per onError handler sulle immagini

import Link from 'next/link'
import { Film, Gamepad2, Tv, Medal, Star, Users, Layers, Dice5, TrendingUp } from 'lucide-react'
import type { TrendingItem } from './page'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { useLocalizedMediaRow } from '@/lib/i18n/clientMediaLocalization'

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

function scoreLabel(item: TrendingItem) {
  if (item.avg_rating != null) return item.avg_rating.toFixed(1)
  return null
}

export function TrendingHeroCard({ item, rank }: { item: TrendingItem; rank: number }) {
  const localizedItem = useLocalizedMediaRow(item, {
    titleKeys: ['title'],
    coverKeys: ['cover_image'],
    idKeys: ['external_id'],
    typeKeys: ['type'],
  }) || item
  const type = normalizeType(localizedItem.type)
  const Icon = TYPE_ICON[type] || Film
  const rating = scoreLabel(item)
  const rankLabel = rank === 0 ? 'Trend leader' : rank === 1 ? 'In salita' : 'Caldo ora'

  return (
    <Link
      href={discoverHref({ ...localizedItem, type })}
      data-no-swipe="true"
      className={`group relative min-h-[250px] overflow-hidden rounded-[28px] border bg-[var(--bg-card)] p-4 transition-all hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${rank === 0 ? 'md:col-span-2 border-[rgba(230,255,61,0.28)]' : 'border-[var(--border-subtle)]'}`}
      aria-label={`Apri ${localizedItem.title} in Discover`}
    >
      {localizedItem.cover_image ? (
        <img src={localizedItem.cover_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-42 blur-[1px] transition-transform duration-500 group-hover:scale-105" loading={rank === 0 ? 'eager' : 'lazy'} onError={(e) => { e.currentTarget.style.display = 'none' }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[var(--bg-secondary)] text-[var(--text-muted)]"><Icon size={44} /></div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/64 to-black/10" />
      <div className="relative z-10 flex h-full min-h-[218px] flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/42 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur">
            <Medal size={13} className={rank === 0 ? 'text-yellow-300' : rank === 1 ? 'text-zinc-300' : 'text-amber-600'} />
            #{rank + 1} · {rankLabel}
          </div>
          <MediaTypeBadge type={type} size="xs" />
        </div>
        <div>
          <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-[rgba(230,255,61,0.12)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--accent)]"><TrendingUp size={11} /> settimana</p>
          <h3 className="line-clamp-2 font-display text-[28px] font-black leading-[0.95] tracking-[-0.045em] text-white md:text-[34px]">{localizedItem.title}</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/12 px-2.5 py-1 text-[12px] font-black text-emerald-300"><Users size={12} /> {localizedItem.count} aggiunte</span>
            {rating && <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/12 px-2.5 py-1 text-[12px] font-black text-yellow-300"><Star size={12} fill="currentColor" /> {rating}</span>}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function TrendingCard({ item, rank, compact = false }: { item: TrendingItem; rank: number; compact?: boolean }) {
  const localizedItem = useLocalizedMediaRow(item, {
    titleKeys: ['title'],
    coverKeys: ['cover_image'],
    idKeys: ['external_id'],
    typeKeys: ['type'],
  }) || item
  const type = normalizeType(localizedItem.type)
  const Icon = TYPE_ICON[type] || Film
  const medalClass = rank === 0 ? 'text-yellow-300' : rank === 1 ? 'text-zinc-300' : rank === 2 ? 'text-amber-600' : 'text-[var(--text-muted)]'
  const isPodium = rank < 3

  return (
    <Link
      href={discoverHref({ ...localizedItem, type })}
      data-no-swipe="true"
      className={`group flex items-center gap-3 rounded-[20px] border bg-[var(--bg-card)] ${compact ? 'p-2' : 'p-2.5'} transition-all hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${
        rank === 0 && !compact
          ? 'border-[rgba(230,255,61,0.28)] shadow-[0_12px_42px_rgba(230,255,61,0.045)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
      }`}
      aria-label={`Apri ${localizedItem.title} in Discover`}
    >
      <div className={`flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/5 ${isPodium ? 'bg-black/24' : 'bg-[var(--bg-secondary)]'}`}>
        {isPodium
          ? <Medal size={compact ? 16 : 18} className={medalClass} />
          : <span className="font-mono-data text-xs font-black text-[var(--text-muted)]">#{rank + 1}</span>}
      </div>

      <div className={`${compact ? 'h-[62px] w-11' : 'h-[88px] w-16'} flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5`}>
        {localizedItem.cover_image ? (
          <img
            src={localizedItem.cover_image}
            alt={localizedItem.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading={rank < 8 ? 'eager' : 'lazy'}
            fetchPriority={rank < 4 ? 'high' : 'auto'}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon size={compact ? 16 : 20} className="text-[var(--text-muted)]" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="mb-1.5 flex items-center gap-2">
            <MediaTypeBadge type={type} size="xs" />
            {rank === 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(230,255,61,0.26)] bg-[rgba(230,255,61,0.08)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                <TrendingUp size={10} /> top
              </span>
            )}
          </div>
        )}
        <p className={`${compact ? 'text-[13px]' : 'text-[14px]'} line-clamp-1 font-bold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]`}>
          {localizedItem.title}
        </p>
        <p className="gk-mono mt-1 text-[var(--text-muted)]">apri in Discover</p>
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300">
          <Users size={11} />
          <span className="font-mono-data text-[11px] font-black">{localizedItem.count}</span>
        </div>
        {localizedItem.avg_rating != null && (
          <div className="inline-flex items-center gap-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-yellow-300">
            <Star size={11} fill="currentColor" />
            <span className="font-mono-data text-[11px] font-black">{localizedItem.avg_rating.toFixed(1)}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
