import type { Recommendation, TasteProfile } from './types'

export type RecommendationRailKind =
  | 'top-match'
  | 'continue'
  | 'social'
  | 'fresh'
  | 'discovery'
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
  nicheUser?: boolean
}

const MIN_RAIL_ITEMS = 4
const MAX_RAIL_ITEMS = 20

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
  const byScore = [...allItems].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
  const topGenre = tasteProfile?.globalGenres?.[0]?.genre
  const lovedTitle = tasteProfile?.topTitlesForContext?.[0]
  const lovedTitleGenres = lovedTitle
    ? Object.entries(tasteProfile?.genreToTitles || {})
      .filter(([, titles]) => titles.some(title => title.title === lovedTitle.title))
      .map(([genre]) => genre)
    : []

  pushRail(rails, {
    id: 'top-match',
    title: 'Scelte fortissime per te',
    subtitle: 'I match piu alti del tuo profilo, mescolati tra tutti i media',
    kind: 'top-match',
    items: takeRail(byScore.filter(item => (item.matchScore || 0) >= 78)),
    badge: 'Top match',
    priority: 100,
  })

  pushRail(rails, {
    id: 'continue',
    title: 'Continua il viaggio',
    subtitle: 'Sequel, spin-off e capitoli collegati a cio che hai gia finito',
    kind: 'continue',
    items: takeRail(byScore.filter(item => item.isContinuity)),
    badge: 'Next up',
    priority: 98,
  })

  if (lovedTitle && lovedTitleGenres.length > 0) {
    pushRail(rails, {
      id: `because-${lovedTitle.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
      title: `Perche hai amato ${lovedTitle.title}`,
      subtitle: 'Stessa energia, segnali simili e compatibilita alta',
      kind: 'because-title',
      items: takeRail(byScore.filter(item => item.genres?.some(genre => lovedTitleGenres.includes(genre)))),
      badge: 'Because',
      priority: 94,
    })
  }

  pushRail(rails, {
    id: 'social',
    title: 'Piacciono a persone simili a te',
    subtitle: 'Segnali social e amici con gusti compatibili',
    kind: 'social',
    items: takeRail(byScore.filter(item => item.socialBoost || item.friendWatching)),
    badge: 'Taste twins',
    priority: 90,
  })

  pushRail(rails, {
    id: 'fresh',
    title: 'Caldi adesso nei tuoi gusti',
    subtitle: 'Titoli recenti, stagionali o premiati che entrano bene nel tuo profilo',
    kind: 'fresh',
    items: takeRail(byScore.filter(item => item.isSeasonal || item.isAwardWinner || (item.year && item.year >= new Date().getFullYear() - 1))),
    badge: 'Fresh',
    priority: 82,
  })

  pushRail(rails, {
    id: 'quick-picks',
    title: 'Perfetti per stasera',
    subtitle: 'Film, serie brevi, anime compatti e giochi da tavolo non infiniti',
    kind: 'quick-picks',
    items: takeRail(byScore.filter(item =>
      item.type === 'movie' ||
      (item.episodes && item.episodes <= 12) ||
      (item.playing_time && item.playing_time <= 90)
    )),
    badge: 'Easy start',
    priority: 76,
  })

  pushRail(rails, {
    id: 'discovery',
    title: 'Fuori dalla bolla, ma non a caso',
    subtitle: 'Scoperte vicine ai tuoi gusti senza ripetere sempre lo stesso genere',
    kind: 'discovery',
    items: takeRail(byScore.filter(item => item.isDiscovery || item.isSerendipity)),
    badge: 'Discovery',
    priority: 72,
  })

  pushRail(rails, {
    id: 'hidden-gems',
    title: tasteProfile?.nicheUser ? 'Gemme strane, esattamente il tuo campo' : 'Gemme nascoste da provare',
    subtitle: 'Titoli meno ovvi che restano sopra la soglia di compatibilita',
    kind: 'hidden-gems',
    items: takeRail(byScore.filter(item =>
      (item.matchScore || 0) >= 68 &&
      !item.isAwardWinner &&
      !item.isSeasonal &&
      !item.isContinuity
    ).slice(4)),
    badge: 'Hidden gem',
    priority: 66,
  })

  if (topGenre) {
    pushRail(rails, {
      id: `genre-${topGenre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: `Perche ami ${topGenre}`,
      subtitle: 'Una riga costruita sul tuo segnale dominante',
      kind: 'genre',
      items: takeRail(byScore.filter(item => item.genres?.includes(topGenre))),
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
      items: takeRail(byScore),
      badge: 'Best of',
      priority: 1,
    })
  }

  return rails
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8)
}
