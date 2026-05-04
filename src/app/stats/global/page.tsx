import Link from 'next/link'
import { Clock, Film, Gamepad2, Globe, Layers, Star, Trophy, Tv } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LocalizedPopularTitleRow } from '@/components/stats/LocalizedPopularTitleRow'
import { getServerLocale } from '@/lib/i18n/serverLocale'
import { pageCopy } from '@/lib/i18n/pageCopy'

async function getGlobalStats() {
  const supabase = await createClient()

  const [
    { count: totalUsers },
    { data: mediaAgg },
    { data: topTitles },
    { data: topGenres },
    { count: totalPosts },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('user_media_entries').select('type, current_episode, is_steam, status'),
    supabase
      .from('user_media_entries')
      .select('title, type, cover_image, external_id')
      .not('title', 'is', null)
      .limit(500),
    supabase.from('user_media_entries').select('genres').not('genres', 'is', null),
    supabase.from('posts').select('id', { count: 'exact', head: true }),
  ])

  const entries = mediaAgg || []
  let animeEps = 0
  let mangaChapters = 0
  let gameHours = 0
  let movieCount = 0
  let tvEps = 0
  let totalEntries = 0

  for (const entry of entries) {
    totalEntries += 1
    const progress = entry.current_episode || 0

    if (entry.type === 'anime') animeEps += progress
    if (entry.type === 'manga') mangaChapters += progress
    if (entry.type === 'game' && entry.is_steam) gameHours += progress
    if (entry.type === 'movie' && entry.status === 'completed') movieCount += 1
    if (entry.type === 'tv') tvEps += progress
  }

  const animeHours = Math.round((animeEps * 24) / 60)
  const mangaHours = Math.round((mangaChapters * 5) / 60)
  const movieHours = Math.round(movieCount * 1.8)
  const tvHours = Math.round((tvEps * 45) / 60)
  const totalHours = animeHours + mangaHours + gameHours + movieHours + tvHours

  const titleMap = new Map<string, { count: number; item: any }>()
  for (const row of topTitles || []) {
    if (!row.title) continue
    const key = `${row.type}::${row.external_id || row.title}`
    if (!titleMap.has(key)) titleMap.set(key, { count: 0, item: row })
    titleMap.get(key)!.count += 1
  }

  const popularTitles = [...titleMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const genreMap = new Map<string, number>()
  for (const row of topGenres || []) {
    if (!Array.isArray(row.genres)) continue
    for (const genre of row.genres) {
      if (genre) genreMap.set(genre, (genreMap.get(genre) || 0) + 1)
    }
  }

  const popularGenres = [...genreMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  return {
    totalUsers: totalUsers || 0,
    totalEntries,
    totalPosts: totalPosts || 0,
    totalHours,
    animeHours,
    mangaHours,
    gameHours,
    movieHours,
    tvHours,
    animeEps,
    mangaChapters,
    movieCount,
    tvEps,
    popularTitles,
    popularGenres,
  }
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString('it')
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/58 px-5 py-4 ring-1 ring-white/5">
      <p className="font-display text-[28px] font-black leading-none tracking-[-0.04em] text-[var(--text-primary)]">{value}</p>
      <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      {sub && <p className="mt-1 text-[12px] leading-5 text-[var(--text-subtle)]">{sub}</p>}
    </div>
  )
}

function CategoryRow({ label, value, sub, color, max, icon: Icon }: {
  label: string
  value: number
  sub: string
  color: string
  max: number
  icon: React.ElementType
}) {
  return (
    <div className="rounded-[22px] border border-[var(--border-subtle)] bg-black/16 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[15px] border border-white/8 bg-black/25" style={{ color }}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-[14px] font-black text-[var(--text-primary)]">{label}</p>
            <p className="shrink-0 font-mono-data text-[15px] font-black text-[var(--text-primary)]">{formatNumber(value)}h</p>
          </div>
          <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">{sub}</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/38">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: max > 0 ? `${Math.max(2, (value / max) * 100)}%` : '0%', background: color }}
        />
      </div>
    </div>
  )
}

export default async function GlobalStatsPage() {
  const locale = await getServerLocale()
  const copy = pageCopy(locale)
  const stats = await getGlobalStats()
  const totalDays = Math.floor(stats.totalHours / 24)
  const remainingHours = stats.totalHours % 24
  const dominant = [
    { label: copy.stats.categories.game, value: stats.gameHours },
    { label: copy.stats.categories.movie, value: stats.movieHours },
    { label: 'Anime', value: stats.animeHours },
    { label: copy.stats.categories.tv, value: stats.tvHours },
    { label: 'Manga', value: stats.mangaHours },
  ].sort((a, b) => b.value - a.value)[0]

  const maxCategoryHours = Math.max(stats.animeHours, stats.gameHours, stats.tvHours, stats.movieHours, stats.mangaHours, 1)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-24 text-[var(--text-primary)]">
      <div className="mx-auto max-w-screen-md px-4 pt-8">
        <section className="rounded-[32px] border border-[rgba(230,255,61,0.2)] bg-[radial-gradient(circle_at_top_left,rgba(230,255,61,0.12),transparent_42%),var(--bg-card)] px-6 py-6 shadow-[0_24px_70px_rgba(0,0,0,0.34)] ring-1 ring-white/5 sm:px-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.28)] bg-[rgba(230,255,61,0.08)] px-3 py-1 font-mono-data text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                <Globe size={13} />
                {copy.globalStats.title}
              </div>
              <h1 className="font-display text-[42px] font-black leading-[0.92] tracking-[-0.06em] text-[var(--text-primary)] sm:text-[54px]">
                {formatNumber(stats.totalUsers)} {copy.globalStats.users}, {formatNumber(stats.totalEntries)} {copy.globalStats.entries}
              </h1>
              <p className="mt-3 max-w-xl text-[15px] leading-6 text-[var(--text-secondary)]">
                {copy.globalStats.descriptionPrefix} <strong className="text-[var(--text-primary)]">{formatNumber(stats.totalHours)} {copy.globalStats.descriptionMiddle}</strong>: {totalDays} {locale === 'en' ? 'days' : 'giorni'} {locale === 'en' ? 'and' : 'e'} {remainingHours} {copy.globalStats.descriptionMiddle} {copy.globalStats.descriptionSuffix}
              </p>
            </div>
            <Link
              href="/stats"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-[18px] border border-[var(--border)] bg-[var(--bg-secondary)] px-5 text-[13px] font-black text-[var(--text-primary)] transition hover:border-[rgba(230,255,61,0.35)] hover:text-[var(--accent)]"
            >
              {locale === 'en' ? 'My stats' : 'Le mie stats'}
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-4">
          <MetricCard label={copy.globalStats.totalHours} value={formatNumber(stats.totalHours)} sub={locale === "en" ? "aggregated estimate" : "stima aggregata"} />
          <MetricCard label={copy.globalStats.posts} value={formatNumber(stats.totalPosts)} sub={locale === "en" ? "published" : "pubblicati"} />
          <MetricCard label={locale === "en" ? "Dominant" : "Dominante"} value={dominant?.label || '—'} sub={dominant ? `${formatNumber(dominant.value)}h` : undefined} />
          <MetricCard label={locale === "en" ? "Movies watched" : "Film visti"} value={formatNumber(stats.movieCount)} sub={locale === "en" ? "completed" : "completati"} />
        </section>

        <section className="mt-8 rounded-[30px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/68 p-5 ring-1 ring-white/5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-[14px] border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.07)] text-[var(--accent)]">
              <Clock size={17} />
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{locale === 'en' ? 'Distribution' : 'Distribuzione'}</p>
              <h2 className="font-display text-[26px] font-black leading-none tracking-[-0.04em]">{locale === 'en' ? 'Hours by category' : 'Ore per categoria'}</h2>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <CategoryRow label={copy.stats.categories.game} value={stats.gameHours} sub={copy.stats.steamHours} color="var(--type-game)" max={maxCategoryHours} icon={Gamepad2} />
            <CategoryRow label={copy.stats.categories.movie} value={stats.movieHours} sub={`${formatNumber(stats.movieCount)} film`} color="var(--type-movie)" max={maxCategoryHours} icon={Film} />
            <CategoryRow label="Anime" value={stats.animeHours} sub={`${formatNumber(stats.animeEps)} ${locale === "en" ? "episodes" : "episodi"}`} color="var(--type-anime)" max={maxCategoryHours} icon={Tv} />
            <CategoryRow label={copy.stats.categories.tv} value={stats.tvHours} sub={`${formatNumber(stats.tvEps)} ${locale === "en" ? "episodes" : "episodi"}`} color="var(--type-tv)" max={maxCategoryHours} icon={Tv} />
            <CategoryRow label="Manga" value={stats.mangaHours} sub={`${formatNumber(stats.mangaChapters)} ${locale === "en" ? "chapters" : "capitoli"}`} color="var(--type-manga)" max={maxCategoryHours} icon={Layers} />
          </div>
        </section>

        {stats.popularTitles.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2">
              <Trophy size={15} className="text-[var(--accent)]" />
              <h2 className="text-[12px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{copy.globalStats.mostAdded}</h2>
            </div>
            <div className="space-y-2.5">
              {stats.popularTitles.map((title, index) => (
                <LocalizedPopularTitleRow key={`${title.item.type}-${title.item.external_id || title.item.title}`} title={title} index={index} />
              ))}
            </div>
          </section>
        )}

        {stats.popularGenres.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2">
              <Star size={15} className="text-[var(--accent)]" />
              <h2 className="text-[12px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{locale === 'en' ? 'Most loved genres' : 'Generi più amati'}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {stats.popularGenres.map(([genre, count]) => (
                <span key={genre} className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[13px] font-bold text-[var(--text-primary)]">
                  {genre}
                  <span className="font-mono-data text-[11px] font-black text-[var(--accent)]">{formatNumber(count)}</span>
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
