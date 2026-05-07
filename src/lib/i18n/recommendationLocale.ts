import type { Locale } from './serverLocale'
import type { Recommendation } from '@/lib/reco/types'
import { composeRecommendationRails } from '@/lib/reco/rails'
import { translateWithCache } from '@/lib/deepl'
import { cleanDescriptionForDisplay } from '@/lib/text/descriptionCleanup'

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

function cleanDescription(value: unknown): string | undefined {
  return cleanDescriptionForDisplay(value)
}

function tmdbId(item: any): string | null {
  const raw = String(item?.external_id || item?.id || '')
  if (!raw) return null
  if (/^\d+$/.test(raw)) return raw

  const match = raw.match(/tmdb-(?:movie|tv|anime)-(\d+)/)
  return match?.[1] || null
}

function isTmdbTitleType(item: any): boolean {
  return item?.type === 'movie' || item?.type === 'tv'
}

function tmdbLanguage(locale: Locale): 'it-IT' | 'en-US' {
  return locale === 'it' ? 'it-IT' : 'en-US'
}

function tmdbImage(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return `https://image.tmdb.org/t/p/w780${path}`
}

function pickPoster(posters: any[], preferredLanguage: 'it' | 'en'): string | undefined {
  if (!Array.isArray(posters) || posters.length === 0) return undefined

  const ranked = [...posters]
    .filter(p => p?.file_path)
    .sort((a, b) => {
      const aLang = a.iso_639_1 === preferredLanguage ? 3 : a.iso_639_1 === null ? 2 : 1
      const bLang = b.iso_639_1 === preferredLanguage ? 3 : b.iso_639_1 === null ? 2 : 1
      if (aLang !== bLang) return bLang - aLang
      const aScore = (Number(a.vote_average) || 0) * 100 + (Number(a.vote_count) || 0)
      const bScore = (Number(b.vote_average) || 0) * 100 + (Number(b.vote_count) || 0)
      return bScore - aScore
    })

  return tmdbImage(ranked[0]?.file_path)
}

async function fetchOfficialTmdbLocaleAssets(item: any, locale: Locale): Promise<{ title?: string; description?: string; coverImage?: string }> {
  const token = process.env.TMDB_API_KEY
  if (!token || !isTmdbTitleType(item)) return {}

  const id = tmdbId(item)
  if (!id) return {}

  try {
    const endpoint = item.type === 'movie' ? 'movie' : 'tv'
    const [detailsRes, imagesRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${endpoint}/${id}?language=${tmdbLanguage(locale)}`, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
        next: { revalidate: 60 * 60 * 24 },
      }),
      fetch(`https://api.themoviedb.org/3/${endpoint}/${id}/images?include_image_language=${locale},null`, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
        next: { revalidate: 60 * 60 * 24 },
      }),
    ])

    const details = detailsRes.ok ? await detailsRes.json() : null
    const images = imagesRes.ok ? await imagesRes.json() : null

    return {
      title: cleanText(details?.title || details?.name),
      description: cleanDescription(details?.overview),
      coverImage: pickPoster(images?.posters || [], locale),
    }
  } catch {
    return {}
  }
}

async function ensureOfficialTitlesLocale<T extends Recommendation>(
  items: T[],
  locale: Locale,
  options?: { maxSync?: number },
): Promise<T[]> {
  const maxSync = options?.maxSync ?? 60
  const out = items.map(item => ({ ...item })) as T[]

  // IMPORTANTE:
  // Per movie/tv TMDb bisogna forzare il titolo ufficiale della lingua richiesta.
  // Non basta controllare title_en/title_it, perché i backfill vecchi hanno spesso
  // copiato title italiano dentro title_en. Quindi qui sovrascriviamo la response
  // con il titolo ufficiale TMDb quando disponibile.
  const tmdbItems = out
    .filter(item => isTmdbTitleType(item))
    .filter(item => Boolean(tmdbId(item)))
    .slice(0, maxSync)

  if (tmdbItems.length === 0) return out

  const results = await Promise.allSettled(
    tmdbItems.map(async item => ({
      item,
      ...(await fetchOfficialTmdbLocaleAssets(item, locale)),
    })),
  )

  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    const title = cleanText(result.value.title)
    const description = cleanDescription(result.value.description)
    const coverImage = cleanText(result.value.coverImage)
    if (!title && !description && !coverImage) continue

    const mutable = result.value.item as any

    if (title) {
      mutable[`title_${locale}`] = title
      // Questo serve perché alcuni componenti usano direttamente item.title.
      mutable.title = title
    }

    if (coverImage) {
      mutable[`cover_image_${locale}`] = coverImage
      mutable.coverImage = coverImage
      mutable.cover_image = coverImage
    }

    if (description) {
      mutable[`description_${locale}`] = description
      mutable.description = description
    }

    mutable.localized = {
      ...(mutable.localized || {}),
      [locale]: {
        ...(mutable.localized?.[locale] || {}),
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(coverImage ? { coverImage } : {}),
        ...(!description && cleanText(mutable.localized?.[locale]?.description)
          ? { description: mutable.localized[locale].description }
          : {}),
      },
    }
  }

  return out
}

function translationKey(item: any, sourceLocale: Locale, targetLocale: Locale) {
  const source = item?.source || item?.type || 'media'
  const id = item?.external_id || item?.id || item?.appid || item?.title || 'unknown'
  return `${source}:${id}:description:${sourceLocale}->${targetLocale}`
}

function getLocalizedField(item: any, locale: Locale, field: 'title' | 'description'): string | undefined {
  const localized = item?.localized
  if (localized && typeof localized === 'object') {
    const fromJson = field === 'description' ? cleanDescription(localized?.[locale]?.[field]) : cleanText(localized?.[locale]?.[field])
    if (fromJson) return fromJson
  }

  const direct = field === 'description' ? cleanDescription(item?.[`${field}_${locale}`]) : cleanText(item?.[`${field}_${locale}`])
  if (direct) return direct

  if (field === 'title') {
    // Movie/TV vengono forzati prima da ensureOfficialTitlesLocale().
    if (locale === 'it') {
      return cleanText(item?.title_it)
        || cleanText(item?.title)
        || cleanText(item?.title_en)
        || cleanText(item?.title_original)
    }

    return cleanText(item?.title_en)
      || cleanText(item?.title_original)
      || cleanText(item?.title)
      || cleanText(item?.title_it)
  }

  if (locale === 'it') {
    return cleanDescription(item?.description_it)
      || cleanDescription(item?.localized?.it?.description)
  }

  return cleanDescription(item?.description_en)
    || cleanDescription(item?.localized?.en?.description)
}

function getLocalizedCover(item: any, locale: Locale): string | undefined {
  const localized = item?.localized
  if (localized && typeof localized === 'object') {
    const fromJson = cleanText(localized?.[locale]?.coverImage)
      || cleanText(localized?.[locale]?.cover_image)
    if (fromJson) return fromJson
  }

  const direct = cleanText(item?.[`cover_image_${locale}`])
    || cleanText(item?.[`coverImage_${locale}`])
  if (direct) return direct

  if (locale === 'it') {
    return cleanText(item?.cover_image_it)
      || cleanText(item?.coverImage_it)
      || cleanText(item?.localized?.en?.coverImage)
      || cleanText(item?.localized?.en?.cover_image)
      || cleanText(item?.cover_image_en)
      || cleanText(item?.coverImage_en)
      || cleanText(item?.coverImage)
      || cleanText(item?.cover_image)
  }

  return cleanText(item?.cover_image_en)
    || cleanText(item?.coverImage_en)
    || cleanText(item?.localized?.en?.coverImage)
    || cleanText(item?.localized?.en?.cover_image)
    || cleanText(item?.coverImage)
    || cleanText(item?.cover_image)
    || cleanText(item?.cover_image_it)
    || cleanText(item?.coverImage_it)
}

function fallbackDescriptionCandidate(item: any, locale: Locale): string | undefined {
  if (locale === 'it') {
    return cleanDescription(item?.description_en)
      || cleanDescription(item?.localized?.en?.description)
      || cleanDescription(item?.description)
  }

  return cleanDescription(item?.description_it)
    || cleanDescription(item?.localized?.it?.description)
    || cleanDescription(item?.description)
}

function sourceLocaleForMissingTarget(targetLocale: Locale): Locale {
  return targetLocale === 'it' ? 'en' : 'it'
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
      .replace(/^Disponibile su /i, 'Available on ')
  }

  return text
    .replace(/^Because you loved /i, 'Perché hai amato ')
    .replace(/^Based on:/i, 'Basato su:')
    .replace(/^Popular among fans of /i, 'Popolare tra chi ama ')
    .replace(/^Same energy/i, 'Stessa energia')
    .replace(/^Similar signals/i, 'Segnali simili')
    .replace(/^Matches your taste/i, 'In linea con i tuoi gusti')
    .replace(/^Available on /i, 'Disponibile su ')
}

export function localizeRecommendationItem<T extends Recommendation>(item: T, locale: Locale): T {
  const title = getLocalizedField(item, locale, 'title') || item.title
  const description = getLocalizedField(item, locale, 'description') || cleanDescription(item.description) || item.description
  const coverImage = getLocalizedCover(item, locale)

  return {
    ...item,
    title,
    description,
    ...(coverImage ? { coverImage, cover_image: coverImage } : {}),
    why: localizeWhy(item.why, locale),
  }
}

export async function ensureRecommendationDescriptionsLocale<T extends Recommendation>(
  items: T[],
  locale: Locale,
  options?: { maxSync?: number },
): Promise<T[]> {
  const maxSync = options?.maxSync ?? 0
  const out = items.map(item => ({ ...item })) as T[]
  if (maxSync <= 0) return out

  const missing = out
    .filter(item => !getLocalizedField(item, locale, 'description'))
    .map(item => ({ item, source: fallbackDescriptionCandidate(item, locale) }))
    .filter((entry): entry is { item: T; source: string } => Boolean(entry.source))
    .slice(0, maxSync)

  if (missing.length === 0) return out

  const sourceLocale = sourceLocaleForMissingTarget(locale)
  const targetLang = locale === 'it' ? 'IT' : 'EN-US'
  const sourceLang = locale === 'it' ? 'EN' : 'IT'

  const translated = await translateWithCache(
    missing.map(({ item, source }) => ({
      id: translationKey(item, sourceLocale, locale),
      text: source,
    })),
    targetLang,
    sourceLang,
  )

  for (const { item } of missing) {
    const key = translationKey(item, sourceLocale, locale)
    const text = cleanDescription(translated[key])
    if (!text) continue

    const mutable = item as any
    mutable[`description_${locale}`] = text
    mutable.localized = {
      ...(mutable.localized || {}),
      [locale]: {
        ...(mutable.localized?.[locale] || {}),
        title: getLocalizedField(mutable, locale, 'title') || mutable.title,
        description: text,
      },
    }
  }

  return out
}

export async function localizeRecommendationsRecord(
  recommendations: RecommendationsByType,
  locale: Locale,
  options?: { maxSyncTranslations?: number; maxSyncTitles?: number },
): Promise<RecommendationsByType> {
  const entries = await Promise.all(
    Object.entries(recommendations || {}).map(async ([type, items]) => {
      if (!Array.isArray(items)) return [type, []]

      const withTitles = await ensureOfficialTitlesLocale(items, locale, {
        maxSync: options?.maxSyncTitles ?? 18,
      })

      const withDescriptions = await ensureRecommendationDescriptionsLocale(withTitles, locale, {
        maxSync: options?.maxSyncTranslations ?? 0,
      })

      return [
        type,
        withDescriptions.map(item => localizeRecommendationItem(item, locale)),
      ]
    }),
  )

  return Object.fromEntries(entries)
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
      case 'media-type': {
        const type = String(rail.id || '').replace(/^type-/, '') || rail.type || rail.badge || ''
        const titles: Record<string, string> = {
          movie: 'Recommended movies',
          anime: 'Recommended anime',
          tv: 'Recommended TV shows',
          game: 'Recommended games',
          manga: 'Recommended manga',
          boardgame: 'Recommended board games',
        }
        return { title: titles[type] || rail.title, subtitle: rail.subtitle || 'A focused row from one medium, filtered by your taste', badge: rail.badge }
      }
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
    case 'media-type': {
      const type = String(rail.id || '').replace(/^type-/, '') || rail.type || rail.badge || ''
      const titles: Record<string, string> = {
        movie: 'Film consigliati',
        anime: 'Anime consigliati',
        tv: 'Serie consigliate',
        game: 'Videogiochi consigliati',
        manga: 'Manga consigliati',
        boardgame: 'Giochi da tavolo consigliati',
      }
      return { title: titles[type] || rail.title, subtitle: rail.subtitle || 'Una riga mirata su un media, filtrata dai tuoi gusti', badge: rail.badge }
    }
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

export async function buildLocalizedRecommendationPayload(params: {
  recommendations: RecommendationsByType
  tasteProfile: any
  locale: Locale
  base?: Record<string, unknown>
  maxSyncTranslations?: number
  maxSyncTitles?: number
}) {
  const recommendations = await localizeRecommendationsRecord(params.recommendations, params.locale, {
    maxSyncTranslations: params.maxSyncTranslations ?? 0,
    maxSyncTitles: params.maxSyncTitles ?? 18,
  })

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

export async function localizeRecommendationPayload<T extends PayloadLike>(
  payload: T,
  locale: Locale,
  options?: { maxSyncTranslations?: number; maxSyncTitles?: number },
): Promise<T> {
  const recommendations = payload.recommendations
    ? await localizeRecommendationsRecord(payload.recommendations, locale, {
      maxSyncTranslations: options?.maxSyncTranslations ?? 0,
      maxSyncTitles: options?.maxSyncTitles ?? 18,
    })
    : undefined

  const items = recommendations
    ? flattenRecommendations(recommendations)
    : Array.isArray(payload.items)
      ? (await ensureRecommendationDescriptionsLocale(
        await ensureOfficialTitlesLocale(payload.items, locale, { maxSync: options?.maxSyncTitles ?? 18 }),
        locale,
        { maxSync: options?.maxSyncTranslations ?? 0 },
      )).map(item => localizeRecommendationItem(item, locale))
      : payload.items

  return {
    ...payload,
    ...(recommendations ? { recommendations } : {}),
    ...(items ? { items } : {}),
    rails: localizeRecommendationRails(payload.rails, locale),
  }
}
