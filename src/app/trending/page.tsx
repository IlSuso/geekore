// src/app/trending/page.tsx
// Bacheca community: i media più aggiunti e votati questa settimana.
// Server Component — dati freschi ad ogni richiesta.

import { createClient } from '@/lib/supabase/server'
import { TrendingUp, Flame, Star, Users, Radio, Sparkles, Compass } from 'lucide-react'
import Link from 'next/link'
import { TrendingCard, TrendingHeroCard } from './TrendingCard'
import { PageScaffold } from '@/components/ui/PageScaffold'
import { getServerLocale } from '@/lib/i18n/serverLocale'
import { pageCopy } from '@/lib/i18n/pageCopy'
import { typeLabel } from '@/lib/i18n/uiCopy'

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
  anime: 'Anime', manga: 'Manga', game: 'Videogiochi',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Giochi da Tavolo', board_game: 'Giochi da Tavolo',
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

function PulseStat({ label, value, accent = false, icon }: { label: string; value: string | number; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="gk-label">{label}</p>
        {icon && <span className={accent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>{icon}</span>}
      </div>
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}

function SectionTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[var(--accent)]">{icon}</span>
        <h2 className="gk-label">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export default async function TrendingPage() {
  const locale = await getServerLocale()
  const copy = pageCopy(locale).trending
  const common = pageCopy(locale).common
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
  const podium = byAdditions.slice(0, 3)
  const remainingTop = byAdditions.slice(3, 10)

  return (
    <PageScaffold
      title={copy.title}
      description={copy.description}
      icon={<TrendingUp size={16} />}
      contentClassName="mx-auto max-w-screen-lg pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[radial-gradient(circle_at_18%_0%,rgba(230,255,61,0.13),transparent_36%),linear-gradient(160deg,rgba(230,255,61,0.07),var(--bg-secondary))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
        <div className="mb-2 gk-section-eyebrow"><Radio size={12} /> {copy.eyebrow}</div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-[34px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)] md:text-[42px]">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[var(--text-secondary)]">{copy.heroDescription}</p>
          </div>
          <Link href="/discover" data-no-swipe="true" className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
            <Compass size={15} /> {locale === "en" ? "Discover more" : "Scopri altro"}
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
          <PulseStat label={copy.titles} value={byAdditions.length} accent icon={<TrendingUp size={14} />} />
          <PulseStat label={locale === "en" ? "additions" : "aggiunte"} value={totalAdds} icon={<Users size={14} />} />
          <PulseStat label={locale === "en" ? "hot medium" : "medium caldo"} value={topType?.count ? typeLabel(topType.type, locale) : '—'} icon={<Flame size={14} />} />
        </div>
      </div>

      {byAdditions.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <TrendingUp size={30} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">{copy.emptyTitle}</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">{copy.emptyDescription}</p>
          <Link href="/discover" data-no-swipe="true" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
            {common.openDiscover}
          </Link>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <section className="mb-8">
              <SectionTitle icon={<Flame size={16} className="text-orange-400" />} title={locale === "en" ? "Weekly podium" : "Podio della settimana"} />
              <div className="grid gap-3 md:grid-cols-2">
                {podium.map((item, i) => <TrendingHeroCard key={`podium-${item.type}-${item.external_id || item.title}`} item={item} rank={i} />)}
              </div>
            </section>
          )}

          {remainingTop.length > 0 && (
            <section className="mb-8 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/55 p-4 ring-1 ring-white/5">
              <SectionTitle icon={<TrendingUp size={16} />} title={copy.moreHot} />
              <div className="grid gap-2 md:grid-cols-2">
                {remainingTop.map((item, i) => (
                  <TrendingCard key={`top-${item.type}-${item.external_id || item.title}`} item={item} rank={i + 3} compact />
                ))}
              </div>
            </section>
          )}

          {byRating.length > 0 && (
            <section className="mb-8">
              <SectionTitle icon={<Star size={16} className="text-yellow-400" fill="currentColor" />} title={copy.topRated} />
              <div className="grid gap-2 md:grid-cols-2">
                {byRating.slice(0, 6).map((item, i) => (
                  <TrendingCard key={`rated-${item.type}-${item.external_id || item.title}`} item={item} rank={i} compact />
                ))}
              </div>
            </section>
          )}

          <section className="mb-8">
            <SectionTitle icon={<Sparkles size={16} />} title={locale === "en" ? "By category" : "Per categoria"} />
            <div className="grid gap-4 lg:grid-cols-2">
              {typeOrder.map(type => {
                const items = grouped[type]
                if (!items?.length) return null
                return (
                  <div key={type} className="rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/60 p-4 ring-1 ring-white/5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="gk-label">{typeLabel(type, locale)}</h3>
                      <span className="gk-mono text-[var(--text-muted)]">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.slice(0, 3).map((item, i) => (
                        <TrendingCard key={`${type}-${item.external_id || item.title}`} item={item} rank={i} compact />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}

      <div className="mt-8 rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-5 text-center">
        <p className="gk-body mb-4">{locale === "en" ? "Want to see how much your media weigh?" : "Vuoi vedere quanto pesano i tuoi media?"}</p>
        <Link
          href="/stats"
          data-no-swipe="true"
          className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--accent)', color: '#0B0B0F' }}
        >
          <TrendingUp size={16} />
          {copy.openTimeDna}
        </Link>
      </div>
    </PageScaffold>
  )
}