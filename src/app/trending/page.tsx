// src/app/trending/page.tsx
// Bacheca community: i media più aggiunti e votati questa settimana.
// Server Component — dati freschi ad ogni richiesta.

import { createClient } from '@/lib/supabase/server'
import { TrendingUp, Flame, Star, Users } from 'lucide-react'
import Link from 'next/link'
import { TrendingCard } from './TrendingCard'
import { PageScaffold } from '@/components/ui/PageScaffold'

export interface TrendingItem {
  title: string
  type: string
  cover_image: string | null
  count: number
  avg_rating: number | null
  external_id: string | null
  rated_count?: number
}

export const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Videogioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Gioco da Tavolo', board_game: 'Gioco da Tavolo',
}

function normalizeType(type: string | null | undefined): string {
  return type === 'board_game' ? 'boardgame' : (type || 'unknown')
}

function makeTrendKey(type: string, title: string, externalId?: string | null): string {
  return `${type}::${externalId || title.trim().toLowerCase()}`
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

  const addMap = new Map<string, TrendingItem & { rating_sum?: number }>()
  for (const row of data || []) {
    if (!row.title) continue
    const type = normalizeType(row.type)
    const rating = typeof row.rating === 'number' && row.rating > 0 ? row.rating : null
    const key = makeTrendKey(type, row.title, row.external_id)
    const existing = addMap.get(key)
    if (existing) {
      existing.count++
      if (rating != null) {
        existing.rated_count = (existing.rated_count || 0) + 1
        existing.rating_sum = (existing.rating_sum || 0) + rating
        existing.avg_rating = existing.rating_sum / existing.rated_count
      }
      if (!existing.cover_image && row.cover_image) existing.cover_image = row.cover_image
    } else {
      addMap.set(key, {
        title: row.title,
        type,
        cover_image: row.cover_image,
        external_id: row.external_id,
        count: 1,
        rated_count: rating != null ? 1 : 0,
        rating_sum: rating ?? 0,
        avg_rating: rating,
      })
    }
  }

  const all = Array.from(addMap.values()).map(({ rating_sum, ...item }) => item)
  const topAdditions = [...all]
    .sort((a, b) => b.count - a.count || (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || a.title.localeCompare(b.title))
    .slice(0, 20)
  const topByRating = all
    .filter(item => item.count >= 2 && item.avg_rating != null && (item.rated_count || 0) >= 2)
    .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || b.count - a.count)
    .slice(0, 10)

  return { byAdditions: topAdditions, byRating: topByRating }
}

function PulseStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

export default async function TrendingPage() {
  const { byAdditions, byRating } = await getTrending()

  const grouped = byAdditions.reduce((acc: Record<string, TrendingItem[]>, item) => {
    const type = normalizeType(item.type)
    if (!acc[type]) acc[type] = []
    acc[type].push({ ...item, type })
    return acc
  }, {})

  const typeOrder = ['game', 'anime', 'tv', 'movie', 'manga', 'boardgame']
  const totalAdds = byAdditions.reduce((sum, item) => sum + item.count, 0)
  const topType = typeOrder
    .map(type => ({ type, count: grouped[type]?.reduce((sum, item) => sum + item.count, 0) || 0 }))
    .sort((a, b) => b.count - a.count)[0]

  return (
    <PageScaffold
      title="Trending"
      description="Il battito settimanale della community: titoli aggiunti, votati e scoperti."
      icon={<TrendingUp size={16} />}
      contentClassName="pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 grid grid-cols-3 gap-3">
        <PulseStat label="titoli" value={byAdditions.length} accent />
        <PulseStat label="aggiunte" value={totalAdds} />
        <PulseStat label="medium caldo" value={topType?.count ? (TYPE_LABEL[topType.type] || topType.type) : '—'} />
      </div>

      {byAdditions.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <TrendingUp size={30} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun dato questa settimana</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">Aggiungi titoli alla Library o torna quando la community avrà generato nuovo segnale.</p>
          <Link href="/discover" data-no-swipe="true" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
            Apri Discover
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-10">
            <h2 className="gk-label mb-4 flex items-center gap-1.5">
              <Flame size={13} className="text-orange-400" /> Top questa settimana
            </h2>
            <div className="space-y-2">
              {byAdditions.slice(0, 10).map((item, i) => (
                <TrendingCard key={`top-${item.type}-${item.external_id || item.title}`} item={item} rank={i} />
              ))}
            </div>
          </div>

          {byRating.length > 0 && (
            <div className="mb-10">
              <h2 className="gk-label mb-4 flex items-center gap-1.5">
                <Star size={13} className="text-yellow-400" fill="currentColor" /> Più votati questa settimana
              </h2>
              <div className="space-y-2">
                {byRating.map((item, i) => (
                  <TrendingCard key={`rated-${item.type}-${item.external_id || item.title}`} item={item} rank={i} />
                ))}
              </div>
            </div>
          )}

          {typeOrder.map(type => {
            const items = grouped[type]
            if (!items?.length) return null
            return (
              <div key={type} className="mb-10">
                <h2 className="gk-label mb-4 flex items-center gap-1.5">
                  <Users size={13} className="text-[var(--text-muted)]" /> {TYPE_LABEL[type] || type}
                </h2>
                <div className="space-y-2">
                  {items.slice(0, 5).map((item, i) => (
                    <TrendingCard key={`${type}-${item.external_id || item.title}`} item={item} rank={i} />
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      <div className="mt-8 rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-5 text-center">
        <p className="gk-body mb-4">Vuoi vedere quanto pesano i tuoi media?</p>
        <Link
          href="/stats"
          data-no-swipe="true"
          className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--accent)', color: '#0B0B0F' }}
        >
          <TrendingUp size={16} />
          Apri il tuo Time DNA
        </Link>
      </div>
    </PageScaffold>
  )
}