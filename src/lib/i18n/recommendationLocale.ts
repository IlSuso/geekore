import type { Locale } from './serverLocale'
import type { Recommendation } from '@/lib/reco/types'
import { composeRecommendationRails } from '@/lib/reco/rails'

type RecommendationsByType = Record<string, Recommendation[]>

type PayloadLike = {
  items?: Recommendation[]
  recommendations?: RecommendationsByType
  rails?: any[]
  tasteProfile?: any
  [key: string]: any
}

const TYPE_LABELS: Record<Locale, Record<string, string>> = {
  it: {
    anime: 'Anime',
    manga: 'Manga',
    movie: 'Film',
    tv: 'Serie TV',
    game: 'Videogiochi',
    boardgame: 'Giochi da Tavolo',
  },
  en: {
    anime: 'Anime',
    manga: 'Manga',
    movie: 'Movies',
    tv: 'TV Shows',
    game: 'Games',
    boardgame: 'Board Games',
  },
}

const BAD_EMPTY = new Set(['', 'null', 'undefined', 'nan', 'n/a', 'none'])

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text || BAD_EMPTY.has(text.toLowerCase())) return undefined
  return text
}

function getLocalizedField(item: any, locale: Locale, field: 'title' | 'description'): string | undefined {
  const localized = item?.localized
  if (localized && typeof localized === 'object') {
    const fromJson = cleanText(localized?.[locale]?.[field])
    if (fromJson) return fromJson
  }

  const direct = cleanText(item?.[`${field}_${locale}`])
  if (direct) return direct

  if (locale === 'it') {
    return cleanText(item?.[field])
      || cleanText(item?.[`${field}_en`])
      || cleanText(item?.[`${field}_original`])
  }

  return cleanText(item?.[`${field}_en`])
    || cleanText(item?.[`${field}_original`])
    || cleanText(item?.[field])
    || cleanText(item?.[`${field}_it`])
}

export function mediaTypeLabel(type: string, locale: Locale): string {
  return TYPE_LABELS[locale][type] || type
}

function localizeWhy(why: unknown, locale: Locale): string {
  const text = cleanText(why)
  if (!text) return locale === 'it' ? 'In linea con i tuoi gusti' : 'Matches your taste'

  if (locale === 'en') {
    return text
      .replace(/^Perché hai amato /i, 'Because you loved ')
      .replace(/^Perche hai amato /i, 'Because you loved ')
      .replace(/^Basato su:/i, 'Based on:')
      .replace(/^Popolare tra chi ama /i, 'Popular among fans of ')
      .replace(/^Stessa energia/i, 'Same energy')
      .replace(/^Segnali simili/i, 'Similar signals')
      .replace(/^In linea con i tuoi gusti/i, 'Matches your taste')
  }

  return text
    .replace(/^Because you loved /i, 'Perché hai amato ')
    .replace(/^Based on:/i, 'Basato su:')
    .replace(/^Popular among fans of /i, 'Popolare tra chi ama ')
    .replace(/^Same energy/i, 'Stessa energia')
    .replace(/^Similar signals/i, 'Segnali simili')
    .replace(/^Matches your taste/i, 'In linea con i tuoi gusti')
}

export function localizeRecommendationItem<T extends Recommendation>(item: T, locale: Locale): T {
  const title = getLocalizedField(item, locale, 'title') || item.title
  const description = getLocalizedField(item, locale, 'description') || item.description

  return {
    ...item,
    title,
    description,
    why: localizeWhy(item.why, locale),
  }
}

export function localizeRecommendationsRecord(
  recommendations: RecommendationsByType,
  locale: Locale,
): RecommendationsByType {
  return Object.fromEntries(
    Object.entries(recommendations || {}).map(([type, items]) => [
      type,
      Array.isArray(items) ? items.map(item => localizeRecommendationItem(item, locale)) : [],
    ]),
  )
}

export function flattenRecommendations(value: unknown): Recommendation[] {
  if (Array.isArray(value)) return value as Recommendation[]
  if (!value || typeof value !== 'object') return []
  return Object.values(value as Record<string, unknown>)
    .flatMap(group => Array.isArray(group) ? group : []) as Recommendation[]
}

function railCopy(rail: any, locale: Locale) {
  if (locale === 'en') {
    switch (rail.kind || rail.id) {
      case 'top-match':
        return { title: 'Strong picks for you', subtitle: 'Your highest taste matches, mixed across every medium', badge: 'Top match' }
      case 'continue':
        return { title: 'Continue the journey', subtitle: 'Sequels, spin-offs and connected chapters from titles you finished', badge: 'Next up' }
      case 'social':
        return { title: 'Loved by people like you', subtitle: 'Social signals and friends with compatible taste', badge: 'Taste twins' }
      case 'fresh':
        return { title: 'Hot right now in your taste', subtitle: 'Recent, seasonal or awarded titles that fit your profile', badge: 'Fresh' }
      case 'quick-picks':
        return { title: 'Perfect for tonight', subtitle: 'Movies, short shows, compact anime and board games that do not take forever', badge: 'Easy start' }
      case 'discovery':
        return { title: 'Outside your bubble, not random', subtitle: 'Discoveries close to your taste without repeating the same genre forever', badge: 'Discovery' }
      case 'hidden-gems':
        return { title: 'Hidden gems to try', subtitle: 'Less obvious picks that still clear your compatibility threshold', badge: 'Hidden gem' }
      case 'genre':
        return { title: rail.badge ? `Because you love ${rail.badge}` : 'Because of your top genre', subtitle: 'A row built from your strongest signal', badge: rail.badge }
      case 'because-title':
        return { title: rail.title?.replace(/^Perche hai amato /i, 'Because you loved ').replace(/^Perché hai amato /i, 'Because you loved '), subtitle: 'Same energy, similar signals and high compatibility', badge: 'Because' }
      default:
        return { title: rail.title, subtitle: rail.subtitle, badge: rail.badge }
    }
  }

  switch (rail.kind || rail.id) {
    case 'top-match':
      return { title: 'Scelte fortissime per te', subtitle: 'I match più alti del tuo profilo, mescolati tra tutti i media', badge: 'Top match' }
    case 'continue':
      return { title: 'Continua il viaggio', subtitle: 'Sequel, spin-off e capitoli collegati a ciò che hai già finito', badge: 'Next up' }
    case 'social':
      return { title: 'Piacciono a persone simili a te', subtitle: 'Segnali social e amici con gusti compatibili', badge: 'Taste twins' }
    case 'fresh':
      return { title: 'Caldi adesso nei tuoi gusti', subtitle: 'Titoli recenti, stagionali o premiati che entrano bene nel tuo profilo', badge: 'Fresh' }
    case 'quick-picks':
      return { title: 'Perfetti per stasera', subtitle: 'Film, serie brevi, anime compatti e giochi da tavolo non infiniti', badge: 'Easy start' }
    case 'discovery':
      return { title: 'Fuori dalla bolla, ma non a caso', subtitle: 'Scoperte vicine ai tuoi gusti senza ripetere sempre lo stesso genere', badge: 'Discovery' }
    case 'hidden-gems':
      return { title: 'Gemme nascoste da provare', subtitle: 'Titoli meno ovvi che restano sopra la soglia di compatibilità', badge: 'Hidden gem' }
    case 'genre':
      return { title: rail.badge ? `Perché ami ${rail.badge}` : 'Per il tuo genere dominante', subtitle: 'Una riga costruita sul tuo segnale dominante', badge: rail.badge }
    case 'because-title':
      return { title: rail.title?.replace(/^Because you loved /i, 'Perché hai amato '), subtitle: 'Stessa energia, segnali simili e compatibilità alta', badge: 'Because' }
    default:
      return { title: rail.title, subtitle: rail.subtitle, badge: rail.badge }
  }
}

export function localizeRecommendationRails(rails: any[] | undefined, locale: Locale): any[] | undefined {
  if (!Array.isArray(rails)) return rails
  return rails.map(rail => {
    const copy = railCopy(rail, locale)
    return {
      ...rail,
      ...copy,
      items: Array.isArray(rail.items)
        ? rail.items.map((item: Recommendation) => localizeRecommendationItem(item, locale))
        : rail.items,
    }
  })
}

export function buildLocalizedRecommendationPayload(params: {
  recommendations: RecommendationsByType
  tasteProfile: any
  locale: Locale
  base?: Record<string, unknown>
}) {
  const recommendations = localizeRecommendationsRecord(params.recommendations, params.locale)
  return {
    ...(params.base || {}),
    items: flattenRecommendations(recommendations),
    recommendations,
    rails: localizeRecommendationRails(
      composeRecommendationRails(recommendations, params.tasteProfile),
      params.locale,
    ),
  }
}

export function localizeRecommendationPayload<T extends PayloadLike>(payload: T, locale: Locale): T {
  const recommendations = payload.recommendations
    ? localizeRecommendationsRecord(payload.recommendations, locale)
    : undefined

  const items = recommendations
    ? flattenRecommendations(recommendations)
    : Array.isArray(payload.items)
      ? payload.items.map(item => localizeRecommendationItem(item, locale))
      : payload.items

  return {
    ...payload,
    ...(recommendations ? { recommendations } : {}),
    ...(items ? { items } : {}),
    rails: localizeRecommendationRails(payload.rails, locale),
  }
}
