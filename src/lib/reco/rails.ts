import type { Recommendation, TasteProfile } from './types'

export type RecommendationRailKind =
  | 'top-match'
  | 'continue'
  | 'social'
  | 'fresh'
  | 'discovery'
  | 'media-type'
  | 'genre'
  | 'because-title'
  | 'quick-picks'
  | 'hidden-gems'

export interface RecommendationRail {
  id: string
  title: string
  subtitle: string
  kind: RecommendationRailKind
  items: Recommendation[]
  badge?: string
  priority: number
}

interface RailTasteProfile {
  globalGenres?: Array<{ genre: string; score: number }>
  genreToTitles?: TasteProfile['genreToTitles']
  topTitlesForContext?: TasteProfile['topTitlesForContext']
  collectionSize?: Partial<Record<string, number>>
  nicheUser?: boolean
}

const MIN_RAIL_ITEMS = 4
const MAX_RAIL_ITEMS = 14
const MAX_PAGE_RAILS = 7
const MEDIA_TYPE_ORDER = ['movie', 'anime', 'tv', 'game', 'manga', 'boardgame']
const TYPE_LABELS: Record<string, string> = {
  movie: 'Film consigliati',
  anime: 'Anime consigliati',
  tv: 'Serie consigliate',
  game: 'Videogiochi consigliati',
  manga: 'Manga consigliati',
  boardgame: 'Giochi da tavolo consigliati',
}

const TYPE_BADGES: Record<string, string> = {
  movie: 'Film',
  anime: 'Anime',
  tv: 'Serie',
  game: 'Videogiochi',
  manga: 'Manga',
  boardgame: 'Giochi da tavolo',
}

function uniqueItems(items: Recommendation[]) {
  const seen = new Set<string>()
  const out: Recommendation[] = []
  for (const item of items) {
    const key = `${item.type}:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function takeRail(items: Recommendation[]) {
  return interleaveByType(uniqueItems(items)).slice(0, MAX_RAIL_ITEMS)
}

function itemKey(item: Recommendation) {
  return `${item.type}:${item.id}`
}

function takeRailExclusive(
  items: Recommendation[],
  used: Map<string, number>,
  options: { maxRepeats?: number; limit?: number } = {},
) {
  const maxRepeats = options.maxRepeats ?? 1
  const limit = options.limit ?? MAX_RAIL_ITEMS
  const picked = takeRail(items.filter(item => (used.get(itemKey(item)) || 0) < maxRepeats)).slice(0, limit)
  for (const item of picked) used.set(itemKey(item), (used.get(itemKey(item)) || 0) + 1)
  return picked
}

function takeMixedTopMatches(
  items: Recommendation[],
  used: Map<string, number>,
  options: { threshold: number; limit?: number } = { threshold: 68 },
) {
  const limit = options.limit ?? 10
  const candidates = uniqueItems([
    ...items.filter(item => (item.matchScore || 0) >= options.threshold),
    ...MEDIA_TYPE_ORDER
      .map(type => items.find(item => item.type === type && (item.matchScore || 0) >= Math.max(55, options.threshold - 18)))
      .filter((item): item is Recommendation => Boolean(item)),
  ]).filter(item => (used.get(itemKey(item)) || 0) < 1)

  const buckets = new Map<string, Recommendation[]>()
  for (const type of MEDIA_TYPE_ORDER) {
    buckets.set(type, candidates.filter(item => item.type === type))
  }

  const picked: Recommendation[] = []
  while (picked.length < limit) {
    let moved = false
    for (const type of MEDIA_TYPE_ORDER) {
      const next = buckets.get(type)?.shift()
      if (!next) continue
      picked.push(next)
      used.set(itemKey(next), (used.get(itemKey(next)) || 0) + 1)
      moved = true
      if (picked.length >= limit) break
    }
    if (!moved) break
  }

  return picked
}

function interleaveByType(items: Recommendation[]) {
  const buckets = new Map<string, Recommendation[]>()
  for (const item of items) {
    const bucket = buckets.get(item.type) || []
    bucket.push(item)
    buckets.set(item.type, bucket)
  }

  const out: Recommendation[] = []
  while (out.length < items.length) {
    let moved = false
    for (const bucket of buckets.values()) {
      const item = bucket.shift()
      if (item) {
        out.push(item)
        moved = true
      }
    }
    if (!moved) break
  }
  return out
}

function pushRail(rails: RecommendationRail[], rail: RecommendationRail) {
  if (rail.items.length >= MIN_RAIL_ITEMS || (rail.kind === 'continue' && rail.items.length > 0)) {
    rails.push(rail)
  }
}

export function composeRecommendationRails(
  recommendations: Record<string, Recommendation[]>,
  tasteProfile?: RailTasteProfile | Partial<TasteProfile> | null
): RecommendationRail[] {
  const allItems = uniqueItems(Object.values(recommendations).flat())
  if (allItems.length === 0) return []

  const rails: RecommendationRail[] = []
  const used = new Map<string, number>()
  const byScore = [...allItems].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
  const topGenre = tasteProfile?.globalGenres?.[0]?.genre
  const lovedTitle = tasteProfile?.topTitlesForContext?.[0]
  const lovedTitleGenres = lovedTitle
    ? Object.entries(tasteProfile?.genreToTitles || {})
      .filter(([, titles]) => titles.some(title => title.title === lovedTitle.title))
      .map(([genre]) => genre)
    : []

  // Soglia dinamica: usa 78 se ci sono abbastanza titoli ad alto score, altrimenti scende a 68
  const highScoreCount = byScore.filter(item => (item.matchScore || 0) >= 78).length
  const topMatchThreshold = highScoreCount >= MIN_RAIL_ITEMS ? 78 : 68

  pushRail(rails, {
    id: 'top-match',
    title: 'Scelte fortissime per te',
    subtitle: 'I match piu alti del tuo profilo, mescolati tra tutti i media',
    kind: 'top-match',
    items: takeMixedTopMatches(byScore, used, { threshold: topMatchThreshold, limit: 10 }),
    badge: 'Top match',
    priority: 100,
  })

  const continuityItems = takeRailExclusive(byScore.filter(item => item.isContinuity), used, { maxRepeats: 2, limit: 10 })
  pushRail(rails, {
    id: 'continue',
    title: 'Continua il viaggio',
    subtitle: 'Sequel, spin-off e capitoli collegati a cio che hai gia finito',
    kind: 'continue',
    items: continuityItems,
    badge: 'Next up',
    priority: 80,
  })

  const fallbackTypeOrder = MEDIA_TYPE_ORDER
  const typeOrder = [...fallbackTypeOrder].sort((a, b) => {
    const sizeDelta = (tasteProfile?.collectionSize?.[b] || 0) - (tasteProfile?.collectionSize?.[a] || 0)
    if (sizeDelta !== 0) return sizeDelta
    return fallbackTypeOrder.indexOf(a) - fallbackTypeOrder.indexOf(b)
  })
  for (const type of typeOrder) {
    const items = takeRailExclusive(byScore.filter(item => item.type === type), used, { limit: 12 })
    pushRail(rails, {
      id: `type-${type}`,
      title: TYPE_LABELS[type] || `${type} consigliati`,
      subtitle: 'Una selezione personale senza ripetere i titoli delle altre righe',
      kind: 'media-type',
      items,
      badge: TYPE_BADGES[type] || type,
      priority: 95 - typeOrder.indexOf(type),
    })
  }

  if (lovedTitle && lovedTitleGenres.length > 0) {
    pushRail(rails, {
      id: `because-${lovedTitle.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
      title: `Perche hai amato ${lovedTitle.title}`,
      subtitle: 'Stessa energia, segnali simili e compatibilita alta',
      kind: 'because-title',
      items: takeRailExclusive(byScore.filter(item => item.genres?.some(genre => lovedTitleGenres.includes(genre))), used, { maxRepeats: 2, limit: 10 }),
      badge: 'Because',
      priority: 78,
    })
  }

  pushRail(rails, {
    id: 'social',
    title: 'Piacciono a persone simili a te',
    subtitle: 'Segnali social e amici con gusti compatibili',
    kind: 'social',
    items: takeRailExclusive(byScore.filter(item => item.socialBoost || item.friendWatching), used, { maxRepeats: 2, limit: 10 }),
    badge: 'Taste twins',
    priority: 76,
  })

  pushRail(rails, {
    id: 'fresh',
    title: 'Caldi adesso nei tuoi gusti',
    subtitle: 'Titoli recenti, stagionali o premiati che entrano bene nel tuo profilo',
    kind: 'fresh',
    items: takeRailExclusive(byScore.filter(item => item.isSeasonal || item.isAwardWinner || (item.year && item.year >= new Date().getFullYear() - 1)), used, { limit: 10 }),
    badge: 'Fresh',
    priority: 74,
  })

  pushRail(rails, {
    id: 'quick-picks',
    title: 'Perfetti per stasera',
    subtitle: 'Film, serie brevi, anime compatti e giochi da tavolo non infiniti',
    kind: 'quick-picks',
    items: takeRailExclusive(byScore.filter(item =>
      item.type === 'movie' ||
      (item.episodes && item.episodes <= 12) ||
      (item.playing_time && item.playing_time <= 90)
    ), used, { limit: 10 }),
    badge: 'Easy start',
    priority: 72,
  })

  pushRail(rails, {
    id: 'discovery',
    title: 'Fuori dalla bolla, ma non a caso',
    subtitle: 'Scoperte vicine ai tuoi gusti senza ripetere sempre lo stesso genere',
    kind: 'discovery',
    items: takeRailExclusive(byScore.filter(item => item.isDiscovery || item.isSerendipity), used, { limit: 10 }),
    badge: 'Discovery',
    priority: 70,
  })

  pushRail(rails, {
    id: 'hidden-gems',
    title: tasteProfile?.nicheUser ? 'Gemme strane, esattamente il tuo campo' : 'Gemme nascoste da provare',
    subtitle: 'Titoli meno ovvi che restano sopra la soglia di compatibilita',
    kind: 'hidden-gems',
    items: takeRailExclusive(byScore.filter(item =>
      (item.matchScore || 0) >= 68 &&
      !item.isAwardWinner &&
      !item.isSeasonal &&
      !item.isContinuity
    ).slice(4), used, { limit: 10 }),
    badge: 'Hidden gem',
    priority: 68,
  })

  if (topGenre) {
    pushRail(rails, {
      id: `genre-${topGenre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: `Perche ami ${topGenre}`,
      subtitle: 'Una riga costruita sul tuo segnale dominante',
      kind: 'genre',
      items: takeRailExclusive(byScore.filter(item => item.genres?.includes(topGenre)), used, { maxRepeats: 2, limit: 10 }),
      badge: topGenre,
      priority: 62,
    })
  }

  if (rails.length < 3) {
    pushRail(rails, {
      id: 'fallback-top',
      title: 'Il meglio del tuo pool',
      subtitle: 'Una selezione mista ordinata per compatibilita',
      kind: 'top-match',
      items: takeRailExclusive(byScore, used, { maxRepeats: 2 }),
      badge: 'Best of',
      priority: 1,
    })
  }

  return rails
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_PAGE_RAILS)
}
