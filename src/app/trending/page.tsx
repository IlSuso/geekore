// src/app/trending/page.tsx
// Bacheca community: i media più aggiunti e votati questa settimana.
// Server Component — dati freschi ad ogni richiesta.

import { createClient } from '@/lib/supabase/server'
import { TrendingUp, Flame, Sparkles, Star, Users } from 'lucide-react'
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
    if (!acc[item.type]) acc[item.type] = []
    acc[item.type].push(item)
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
      contentClassName="max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
          <Sparkles size={12} />
          Community pulse
        </div>
        <h1 className="gk-h1 mb-2 text-[var(--text-primary)]">Cosa sta entrando nelle librerie di tutti?</h1>
        <p className="gk-body max-w-2xl">
          Trending legge le aggiunte recenti e fa emergere il rumore utile: cosa cresce, cosa viene votato, quale medium si muove.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
          <PulseStat label="titoli" value={byAdditions.length} accent />
          <PulseStat label="aggiunte" value={totalAdds} />
          <PulseStat label="top medium" value={topType?.count ? (TYPE_LABEL[topType.type] || topType.type) : '—'} />
        </div>
      </div>

      {byAdditions.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <TrendingUp size={30} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun dato questa settimana</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">Aggiungi titoli alla Library o torna quando la community avrà generato nuovo segnale.</p>
          <Link href="/discover" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
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
                <TrendingCard key={`top-${item.type}-${item.title}`} item={item} rank={i} />
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
                <h2 className="gk-label mb-4 flex items-center gap-1.5">
                  <Users size={13} className="text-[var(--text-muted)]" /> {TYPE_LABEL[type] || type}
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

      <div className="mt-8 rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-5 text-center">
        <p className="gk-body mb-4">Vuoi vedere quanto pesano i tuoi media?</p>
        <Link
          href="/stats"
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