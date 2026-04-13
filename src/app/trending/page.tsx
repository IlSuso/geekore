// src/app/trending/page.tsx
// Bacheca community: i media più aggiunti e votati questa settimana.
// Server Component — dati freschi ad ogni richiesta.

import { createClient } from '@/lib/supabase/server'
import { TrendingUp, Star, Users, Film, BookOpen, Gamepad2, Tv, Dices } from 'lucide-react'
import Link from 'next/link'

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface TrendingItem {
  title: string
  type: string
  cover_image: string | null
  count: number
  avg_rating: number | null
  external_id: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
  boardgame: 'bg-yellow-500',
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: BookOpen, game: Gamepad2,
  tv: Tv, movie: Film, boardgame: Dices,
}

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Board Game',
}

const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' }

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getTrending(): Promise<{ byAdditions: TrendingItem[]; byRating: TrendingItem[] }> {
  const supabase = await createClient()

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Top per aggiunte questa settimana
  const { data: byAdditions } = await supabase
    .from('user_media_entries')
    .select('title, type, cover_image, external_id, rating')
    .gte('created_at', oneWeekAgo)
    .not('cover_image', 'is', null)
    .not('title', 'is', null)

  // Aggregazione client-side (Supabase anon non ha accesso a funzioni aggregate custom)
  const addMap = new Map<string, TrendingItem>()
  for (const row of byAdditions || []) {
    if (!row.title) continue
    const key = `${row.type}::${row.title}`
    const existing = addMap.get(key)
    if (existing) {
      existing.count++
      if (row.rating && row.rating > 0) {
        existing.avg_rating = existing.avg_rating
          ? (existing.avg_rating * (existing.count - 1) + row.rating) / existing.count
          : row.rating
      }
    } else {
      addMap.set(key, {
        title: row.title,
        type: row.type,
        cover_image: row.cover_image,
        external_id: row.external_id,
        count: 1,
        avg_rating: row.rating && row.rating > 0 ? row.rating : null,
      })
    }
  }

  const topAdditions = Array.from(addMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  // Top per rating (almeno 2 voti questa settimana)
  const topByRating = Array.from(addMap.values())
    .filter(item => item.count >= 2 && item.avg_rating != null)
    .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
    .slice(0, 10)

  return { byAdditions: topAdditions, byRating: topByRating }
}

// ─── Componenti ──────────────────────────────────────────────────────────────

function TrendingCard({ item, rank }: { item: TrendingItem; rank: number }) {
  const Icon = TYPE_ICON[item.type] || Film
  const medal = MEDAL[rank]

  return (
    <div className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors">
      {/* Rank */}
      <div className="w-8 text-center flex-shrink-0">
        {medal ? (
          <span className="text-xl">{medal}</span>
        ) : (
          <span className="text-sm font-bold text-zinc-600">#{rank + 1}</span>
        )}
      </div>

      {/* Cover */}
      <div className="w-12 h-16 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
        {item.cover_image ? (
          <img
            src={item.cover_image}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon size={20} className="text-zinc-600" />
          </div>
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

// ─── Pagina ──────────────────────────────────────────────────────────────────

export default async function TrendingPage() {
  const { byAdditions, byRating } = await getTrending()

  // Raggruppa per tipo
  const grouped = byAdditions.reduce((acc: Record<string, TrendingItem[]>, item) => {
    if (!acc[item.type]) acc[item.type] = []
    acc[item.type].push(item)
    return acc
  }, {})

  const typeOrder = ['game', 'anime', 'tv', 'movie', 'manga', 'boardgame']

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-screen-2xl mx-auto px-6 pt-8">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
              <TrendingUp size={20} className="text-white" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter">Trending</h1>
          </div>
          <p className="text-zinc-400 text-sm">I media più aggiunti dalla community questa settimana</p>
        </div>

        {byAdditions.length === 0 ? (
          <div className="text-center py-24 text-zinc-500">
            <TrendingUp size={48} className="mx-auto mb-4 opacity-30" />
            <p>Nessun dato questa settimana ancora.</p>
            <p className="text-sm mt-2">Torna domani!</p>
          </div>
        ) : (
          <>
            {/* Top 10 globale */}
            <div className="mb-10">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                🔥 Top questa settimana
              </h2>
              <div className="space-y-2">
                {byAdditions.slice(0, 10).map((item, i) => (
                  <TrendingCard key={`${item.type}-${item.title}`} item={item} rank={i} />
                ))}
              </div>
            </div>

            {/* Top per rating */}
            {byRating.length > 0 && (
              <div className="mb-10">
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                  ⭐ Più votati questa settimana
                </h2>
                <div className="space-y-2">
                  {byRating.map((item, i) => (
                    <TrendingCard key={`rated-${item.type}-${item.title}`} item={item} rank={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Per categoria */}
            {typeOrder.map(type => {
              const items = grouped[type]
              if (!items?.length) return null
              const Icon = TYPE_ICON[type]
              return (
                <div key={type} className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Icon size={16} className="text-zinc-400" />
                    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                      {TYPE_LABEL[type]}
                    </h2>
                  </div>
                  <div className="space-y-2">
                    {items.slice(0, 5).map((item, i) => (
                      <TrendingCard key={`${type}-${item.title}`} item={item} rank={i} />
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* Link alla calcolatrice */}
        <div className="mt-8 bg-zinc-950 border border-zinc-800 rounded-3xl p-6 text-center">
          <p className="text-zinc-400 text-sm mb-4">Curiosi di quanto tempo hai sprecato tu?</p>
          <Link
            href="/stats"
            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold text-sm transition"
          >
            <TrendingUp size={16} />
            Calcola il tuo tempo sprecato
          </Link>
        </div>
      </div>
    </div>
  )
}