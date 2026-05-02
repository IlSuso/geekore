// src/app/trending/page.tsx
// Bacheca community: i media più aggiunti e votati questa settimana.
// Server Component — dati freschi ad ogni richiesta.

import { createClient } from '@/lib/supabase/server'
import { TrendingUp, Flame } from 'lucide-react'
import Link from 'next/link'
import { TrendingCard } from './TrendingCard'

export interface TrendingItem {
  title: string
  type: string
  cover_image: string | null
  count: number
  avg_rating: number | null
  external_id: string | null
}

export const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Videogioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Gioco da Tavolo',
}

async function getTrending(): Promise<{ byAdditions: TrendingItem[]; byRating: TrendingItem[] }> {
  const supabase = await createClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('user_media_entries')
    .select('title, type, cover_image, external_id, rating')
    .gte('created_at', oneWeekAgo)
    .not('cover_image', 'is', null)
    .not('title', 'is', null)

  const addMap = new Map<string, TrendingItem>()
  for (const row of data || []) {
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

  const all = Array.from(addMap.values())
  const topAdditions = [...all].sort((a, b) => b.count - a.count).slice(0, 20)
  const topByRating = all
    .filter(item => item.count >= 2 && item.avg_rating != null)
    .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
    .slice(0, 10)

  return { byAdditions: topAdditions, byRating: topByRating }
}

export default async function TrendingPage() {
  const { byAdditions, byRating } = await getTrending()

  const grouped = byAdditions.reduce((acc: Record<string, TrendingItem[]>, item) => {
    if (!acc[item.type]) acc[item.type] = []
    acc[item.type].push(item)
    return acc
  }, {})

  const typeOrder = ['game', 'anime', 'tv', 'movie', 'manga', 'boardgame']

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pt-2 md:pt-8">

        <div className="hidden md:block mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#E6FF3D' }}>
              <TrendingUp size={20} className="text-black" />
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
            <div className="mb-10">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                <span className="flex items-center gap-1.5">
                  <Flame size={13} className="text-orange-400" /> Top questa settimana
                </span>
              </h2>
              <div className="space-y-2">
                {byAdditions.slice(0, 10).map((item, i) => (
                  <TrendingCard key={`top-${item.type}-${item.title}`} item={item} rank={i} />
                ))}
              </div>
            </div>

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

            {typeOrder.map(type => {
              const items = grouped[type]
              if (!items?.length) return null
              return (
                <div key={type} className="mb-10">
                  <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
                    {TYPE_LABEL[type] || type}
                  </h2>
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

        <div className="mt-8 bg-zinc-950 border border-zinc-800 rounded-3xl p-6 text-center">
          <p className="text-zinc-400 text-sm mb-4">Curiosi di quanto tempo hai sprecato tu?</p>
          <Link
            href="/stats"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm transition"
            style={{ background: '#E6FF3D', color: '#0B0B0F' }}
          >
            <TrendingUp size={16} />
            Calcola il tuo tempo sprecato
          </Link>
        </div>
      </div>
    </div>
  )
}