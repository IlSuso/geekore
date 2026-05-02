'use client'
// src/components/ui/SkeletonCard.tsx
// P5: Aggiunto SkeletonLeaderboardRow — mancava, usato in leaderboard/page.tsx
// Tutti gli altri skeleton esistenti mantenuti invariati.

// ── Media card skeleton (usato in profilo, for-you, discover) ─────────────────
export function SkeletonMediaCard() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden h-[520px] flex flex-col animate-pulse">
      <div className="h-60 skeleton flex-shrink-0" />
      <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-3">
        <div className="h-4 skeleton rounded-full w-4/5" />
        <div className="h-3 skeleton rounded-full w-2/5" />
        <div className="flex gap-1 mt-1">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="w-4 h-4 skeleton rounded-sm" />
          ))}
        </div>
        <div className="mt-auto space-y-2">
          <div className="h-3 skeleton rounded-full w-1/2" />
          <div className="h-2 skeleton rounded-full" />
          <div className="h-2 skeleton rounded-full w-3/4" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonMediaGrid({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMediaCard key={i} />
      ))}
    </div>
  )
}

// ── Post del feed skeleton ────────────────────────────────────────────────────
export function SkeletonFeedPost() {
  return (
    <div className="bg-zinc-900 rounded-2xl animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <div className="w-10 h-10 skeleton rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 skeleton rounded-full w-28" />
          <div className="h-2.5 skeleton rounded-full w-20" />
        </div>
      </div>
      {/* Testo — indentato come il post reale */}
      <div className="pr-5 pb-3" style={{paddingLeft: "68px"}}>
        <div className="h-3.5 skeleton rounded-full w-3/4 mb-2" />
        <div className="h-3.5 skeleton rounded-full w-1/2" />
      </div>
      {/* Azioni */}
      <div className="px-5 py-2.5 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 skeleton rounded-full" />
          <div className="w-5 h-2.5 skeleton rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 skeleton rounded-full" />
          <div className="w-5 h-2.5 skeleton rounded-full" />
        </div>
      </div>
      <div className="pb-1" />
    </div>
  )
}

// ── Profilo skeleton ─────────────────────────────────────────────────────────
export function SkeletonProfile() {
  return (
    <div className="animate-pulse">
      <div className="flex flex-col items-center mb-12">
        <div className="w-36 h-36 skeleton rounded-full mb-6" />
        <div className="h-8 skeleton rounded-full w-48 mb-3" />
        <div className="h-5 skeleton rounded-full w-32 mb-4" />
        <div className="h-4 skeleton rounded-full w-64 mb-4" />
        <div className="flex gap-8 mt-4">
          <div className="text-center">
            <div className="h-6 skeleton rounded-full w-8 mx-auto mb-1" />
            <div className="h-3 skeleton rounded-full w-16" />
          </div>
          <div className="text-center">
            <div className="h-6 skeleton rounded-full w-8 mx-auto mb-1" />
            <div className="h-3 skeleton rounded-full w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Notification skeleton ─────────────────────────────────────────────────────
export function SkeletonNotification() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 animate-pulse">
      <div className="w-11 h-11 skeleton rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 skeleton rounded-full w-3/4" />
        <div className="h-2.5 skeleton rounded-full w-1/3" />
      </div>
      <div className="w-10 h-10 skeleton rounded-lg flex-shrink-0" />
    </div>
  )
}

// ── News card skeleton ────────────────────────────────────────────────────────
export function SkeletonNewsCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-[2/3] skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-3 skeleton rounded-full" />
        <div className="h-3 skeleton rounded-full w-4/5" />
        <div className="h-2 skeleton rounded-full w-1/2 mt-2" />
      </div>
    </div>
  )
}

// ── Discover result skeleton ──────────────────────────────────────────────────
export function SkeletonDiscoverCard() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      <div className="aspect-[2/3] skeleton rounded-2xl" />
      <div className="h-3 skeleton rounded-full w-4/5" />
      <div className="h-2 skeleton rounded-full w-1/3" />
    </div>
  )
}

// ── For You: riga di raccomandazioni orizzontale ──────────────────────────────
export function SkeletonRecommendationCard() {
  return (
    <div className="flex-shrink-0 w-40 animate-pulse">
      <div className="h-60 skeleton rounded-2xl mb-2" />
      <div className="h-3 skeleton rounded-full w-4/5 mb-0.5" />
      <div className="h-3 skeleton rounded-full w-3/5 mb-1.5" />
      <div className="h-2 skeleton rounded-full w-1/3 mb-1" />
      <div className="h-3.5 skeleton rounded-full w-2/3" />
    </div>
  )
}

export function SkeletonForYouRow() {
  return (
    <div className="mb-10 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 skeleton rounded-xl flex-shrink-0" />
        <div>
          <div className="h-5 skeleton rounded-full w-36 mb-1.5" />
          <div className="h-2.5 skeleton rounded-full w-16" />
        </div>
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonRecommendationCard key={i} />
        ))}
      </div>
    </div>
  )
}

// ── "Amici che guardano" skeleton ────────────────────────────────────────────
export function SkeletonFriendsWatching() {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-10 animate-pulse">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 skeleton rounded-xl" />
        <div className="h-5 skeleton rounded-full w-48" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-28">
            <div className="h-40 skeleton rounded-2xl mb-2" />
            <div className="h-3 skeleton rounded-full w-4/5 mb-1" />
            <div className="h-2 skeleton rounded-full w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── P5: Leaderboard row skeleton ──────────────────────────────────────────────
export function SkeletonLeaderboardRow() {
  return (
    <div className="flex items-center gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl animate-pulse">
      {/* Rank */}
      <div className="w-8 h-5 skeleton rounded-full flex-shrink-0" />
      {/* Avatar */}
      <div className="w-10 h-10 skeleton rounded-2xl flex-shrink-0" />
      {/* Info */}
      <div className="flex-1 space-y-2">
        <div className="h-4 skeleton rounded-full w-32" />
        <div className="h-3 skeleton rounded-full w-20" />
      </div>
      {/* Score */}
      <div className="text-right space-y-1">
        <div className="h-4 skeleton rounded-full w-20" />
        <div className="h-2 skeleton rounded-full w-12 ml-auto" />
      </div>
    </div>
  )
}

// ── N5: GeekScore animato con requestAnimationFrame ───────────────────────────
// Conta da 0 al valore reale in 1.5s al primo render.
// Aggiunge rank badge: Novizio / Appassionato / Esperto / Leggenda

import { useEffect, useRef, useState } from 'react'
import { Award, Star, Trophy, Gem } from 'lucide-react'

const RANKS = [
  { min: 0,     label: 'Novizio',      Icon: Award,   color: 'text-zinc-400' },
  { min: 500,   label: 'Appassionato', Icon: Star,    color: 'text-blue-400' },
  { min: 2000,  label: 'Esperto',      Icon: Trophy,  color: 'text-yellow-400' },
  { min: 10000, label: 'Leggenda',     Icon: Gem,     color: 'text-[var(--accent)]' },
]

function getRank(score: number) {
  return [...RANKS].reverse().find(r => score >= r.min) || RANKS[0]
}

export function AnimatedGeekScore({ score }: { score: number }) {
  const [displayed, setDisplayed] = useState(0)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const DURATION = 1500

  useEffect(() => {
    if (score === 0) return
    startRef.current = null

    const animate = (now: number) => {
      if (!startRef.current) startRef.current = now
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / DURATION, 1)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(eased * score))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [score])

  const rank = getRank(score)

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-black tabular-nums text-white">
        {displayed.toLocaleString('it')}
      </span>
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 ${rank.color}`}>
        <rank.Icon size={13} />
        <span className="text-xs font-semibold">{rank.label}</span>
      </div>
    </div>
  )
}