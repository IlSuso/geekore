import type { Recommendation, TasteProfile } from './types'

export type RecommendationRailKind =
  | 'top-match'
  | 'continue'
  | 'social'
  | 'fresh'
  | 'discovery'
  | 'genre'

export interface RecommendationRail {
  id: string
  title: string
  subtitle: string
  kind: RecommendationRailKind
  items: Recommendation[]
}

interface RailTasteProfile {
  globalGenres?: Array<{ genre: string; score: number }>
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
  return uniqueItems(items).slice(0, MAX_RAIL_ITEMS)
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

  pushRail(rails, {
    id: 'top-match',
    title: 'Scelte fortissime per te',
    subtitle: 'I match piu alti del tuo profilo, mescolati tra tutti i media',
    kind: 'top-match',
    items: takeRail(byScore.filter(item => (item.matchScore || 0) >= 78)),
  })

  pushRail(rails, {
    id: 'continue',
    title: 'Continua il viaggio',
    subtitle: 'Sequel, spin-off e capitoli collegati a cio che hai gia finito',
    kind: 'continue',
    items: takeRail(byScore.filter(item => item.isContinuity)),
  })

  pushRail(rails, {
    id: 'social',
    title: 'Piacciono a persone simili a te',
    subtitle: 'Segnali social e amici con gusti compatibili',
    kind: 'social',
    items: takeRail(byScore.filter(item => item.socialBoost || item.friendWatching)),
  })

  pushRail(rails, {
    id: 'fresh',
    title: 'Caldi adesso nei tuoi gusti',
    subtitle: 'Titoli recenti, stagionali o premiati che entrano bene nel tuo profilo',
    kind: 'fresh',
    items: takeRail(byScore.filter(item => item.isSeasonal || item.isAwardWinner || (item.year && item.year >= new Date().getFullYear() - 1))),
  })

  pushRail(rails, {
    id: 'discovery',
    title: 'Fuori dalla bolla, ma non a caso',
    subtitle: 'Scoperte vicine ai tuoi gusti senza ripetere sempre lo stesso genere',
    kind: 'discovery',
    items: takeRail(byScore.filter(item => item.isDiscovery || item.isSerendipity)),
  })

  if (topGenre) {
    pushRail(rails, {
      id: `genre-${topGenre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title: `Perche ami ${topGenre}`,
      subtitle: 'Una riga costruita sul tuo segnale dominante',
      kind: 'genre',
      items: takeRail(byScore.filter(item => item.genres?.includes(topGenre))),
    })
  }

  if (rails.length < 3) {
    pushRail(rails, {
      id: 'fallback-top',
      title: 'Il meglio del tuo pool',
      subtitle: 'Una selezione mista ordinata per compatibilita',
      kind: 'top-match',
      items: takeRail(byScore),
    })
  }

  return rails.slice(0, 6)
}
