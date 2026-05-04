import { NextRequest, NextResponse } from 'next/server'
import { getRequestLocale, type Locale } from '@/lib/i18n/serverLocale'
import { translateWithCache } from '@/lib/deepl'

type MediaLike = Record<string, any>

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const bad = text.toLowerCase()
  if (bad === 'null' || bad === 'undefined' || bad === 'nan' || bad === 'n/a' || bad === 'none') return undefined
  return text
}

function languageGuess(text: string): Locale | null {
  const sample = ` ${text.toLowerCase()} `
  const itHits = [' il ', ' lo ', ' la ', ' gli ', ' le ', ' un ', ' una ', ' che ', ' per ', ' con ', ' della ', ' dello ', ' degli ', ' sono ', ' viene ', ' nella ', ' questo ', ' questa ']
    .filter(token => sample.includes(token)).length
  const enHits = [' the ', ' and ', ' with ', ' for ', ' from ', ' this ', ' that ', ' into ', ' your ', ' their ', ' becomes ', ' follows ', ' story ', ' game ', ' players ']
    .filter(token => sample.includes(token)).length

  if (itHits >= 2 && itHits > enHits) return 'it'
  if (enHits >= 2 && enHits > itHits) return 'en'
  return null
}

function normalizeType(value: unknown): string {
  const type = String(value || '').trim().toLowerCase()
  if (type === 'serie' || type === 'series' || type === 'tv_show' || type === 'show') return 'tv'
  if (type === 'film') return 'movie'
  if (type === 'board_game' || type === 'board-game' || type === 'board') return 'boardgame'
  if (type === 'videogame' || type === 'video_game' || type === 'video-game' || type === 'games') return 'game'
  return type
}

function isTmdbTitleType(item: MediaLike): boolean {
  const type = normalizeType(item.type || item.media_type)
  return type === 'movie' || type === 'tv'
}

function isGameType(item: MediaLike): boolean {
  const type = normalizeType(item.type || item.media_type)
  return type === 'game'
}

function tmdbEndpoint(item: MediaLike): 'movie' | 'tv' | null {
  const type = normalizeType(item.type || item.media_type)
  if (type === 'movie') return 'movie'
  if (type === 'tv') return 'tv'
  return null
}

function tmdbId(item: MediaLike): string | null {
  const raw = String(item.external_id || item.media_id || item.id || '').trim()
  if (!raw) return null
  if (/^\d+$/.test(raw)) return raw

  const match = raw.match(/tmdb-(?:movie|tv|anime)-(\d+)/)
  return match?.[1] || null
}

function tmdbLanguage(locale: Locale): 'it-IT' | 'en-US' {
  return locale === 'it' ? 'it-IT' : 'en-US'
}

function tmdbImage(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return `https://image.tmdb.org/t/p/w780${path}`
}

function steamAppId(item: MediaLike): string | null {
  const candidates = [item.external_id, item.media_id, item.id, item.appid, item.steam_appid]
  for (const value of candidates) {
    const raw = String(value || '').trim()
    if (!raw) continue
    const prefixed = raw.match(/(?:steam|steam-app|steam_app)[-:](\d+)/i)
    if (prefixed?.[1]) return prefixed[1]
    if ((item.source === 'steam' || item.provider === 'steam') && /^\d+$/.test(raw)) return raw
  }
  return null
}

function igdbId(item: MediaLike): string | null {
  const candidates = [item.external_id, item.media_id, item.id, item.igdb_id]
  for (const value of candidates) {
    const raw = String(value || '').trim()
    if (!raw) continue
    const prefixed = raw.match(/igdb[-:](\d+)/i)
    if (prefixed?.[1]) return prefixed[1]
    if ((item.source === 'igdb' || item.provider === 'igdb') && /^\d+$/.test(raw)) return raw
  }
  return null
}

function steamLanguage(locale: Locale): 'italian' | 'english' {
  return locale === 'it' ? 'italian' : 'english'
}

async function fetchSteamGameLocaleAssets(
  item: MediaLike,
  locale: Locale,
): Promise<{ title?: string; description?: string; coverImage?: string; externalId?: string }> {
  const appId = steamAppId(item)
  if (!appId) return {}

  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&l=${steamLanguage(locale)}`,
      {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
        next: { revalidate: 60 * 60 * 24 },
      },
    )
    if (!res.ok) return {}
    const json = await res.json()
    const data = json?.[appId]?.data
    if (!data) return {}

    return {
      title: clean(data.name),
      description: clean(data.short_description) || clean(data.about_the_game?.replace(/<[^>]+>/g, ' ')),
      coverImage: clean(data.header_image) || clean(data.capsule_image) || clean(data.capsule_imagev5),
      externalId: `steam-${appId}`,
    }
  } catch {
    return {}
  }
}

let igdbTokenCache: { token: string; expiresAt: number } | null = null

async function getIgdbToken(): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID || ''
  const clientSecret = process.env.IGDB_CLIENT_SECRET || ''
  if (!clientId || !clientSecret) return null
  if (igdbTokenCache && igdbTokenCache.expiresAt > Date.now() + 60_000) return igdbTokenCache.token

  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(4500) },
    )
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.access_token) return null
    igdbTokenCache = {
      token: String(json.access_token),
      expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    }
    return igdbTokenCache.token
  } catch {
    return null
  }
}

function igdbCoverUrl(cover: any): string | undefined {
  const raw = clean(cover?.url) || clean(cover?.image_id)
  if (!raw) return undefined
  if (raw.startsWith('//')) return `https:${raw.replace('t_thumb', 't_cover_big')}`
  if (raw.startsWith('http')) return raw.replace('t_thumb', 't_cover_big')
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${raw}.jpg`
}

async function fetchIgdbGameAssets(
  item: MediaLike,
): Promise<{ title?: string; description?: string; coverImage?: string; externalId?: string }> {
  const id = igdbId(item)
  if (!id) return {}
  const token = await getIgdbToken()
  const clientId = process.env.IGDB_CLIENT_ID || ''
  if (!token || !clientId) return {}

  try {
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
      },
      body: `fields name,summary,cover.url,cover.image_id; where id = ${Number(id)}; limit 1;`,
      signal: AbortSignal.timeout(4500),
      next: { revalidate: 60 * 60 * 24 },
    })
    if (!res.ok) return {}
    const json = await res.json()
    const game = Array.isArray(json) ? json[0] : null
    if (!game) return {}
    return {
      title: clean(game.name),
      description: clean(game.summary),
      coverImage: igdbCoverUrl(game.cover),
      externalId: `igdb-${id}`,
    }
  } catch {
    return {}
  }
}

async function fetchOfficialGameLocaleAssets(
  item: MediaLike,
  locale: Locale,
): Promise<{ title?: string; description?: string; coverImage?: string; externalId?: string }> {
  if (!isGameType(item)) return {}

  // Steam ha endpoint localizzato per lingua: usiamolo quando abbiamo appid Steam.
  const steam = await fetchSteamGameLocaleAssets(item, locale)
  if (steam.title || steam.description || steam.coverImage) return steam

  // IGDB non è davvero localizzato, ma è una fonte canonica per titolo/copertina.
  // La descrizione inglese verrà poi tradotta lazy da translateWithCache se locale=it.
  return fetchIgdbGameAssets(item)
}

async function fetchOfficialGameLocaleAssetsBatch(
  items: MediaLike[],
  locale: Locale,
): Promise<Map<MediaLike, { title?: string; description?: string; coverImage?: string; externalId?: string }>> {
  const out = new Map<MediaLike, { title?: string; description?: string; coverImage?: string; externalId?: string }>()
  const steamPairs = items
    .map(item => ({ item, id: steamAppId(item) }))
    .filter((entry): entry is { item: MediaLike; id: string } => Boolean(entry.id))
  const igdbPairs = items
    .filter(item => !steamAppId(item))
    .map(item => ({ item, id: igdbId(item) }))
    .filter((entry): entry is { item: MediaLike; id: string } => Boolean(entry.id))

  if (steamPairs.length > 0) {
    const ids = [...new Set(steamPairs.map(entry => entry.id))].slice(0, 80)
    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${ids.map(encodeURIComponent).join(',')}&l=${steamLanguage(locale)}`,
        {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(4500),
          next: { revalidate: 60 * 60 * 24 },
        },
      )
      if (res.ok) {
        const json = await res.json()
        for (const { item, id } of steamPairs) {
          const data = json?.[id]?.data
          if (!data) continue
          out.set(item, {
            title: clean(data.name),
            description: clean(data.short_description) || clean(data.about_the_game?.replace(/<[^>]+>/g, ' ')),
            coverImage: clean(data.header_image) || clean(data.capsule_image) || clean(data.capsule_imagev5),
            externalId: `steam-${id}`,
          })
        }
      }
    } catch {}
  }

  if (igdbPairs.length > 0) {
    const token = await getIgdbToken()
    const clientId = process.env.IGDB_CLIENT_ID || ''
    const ids = [...new Set(igdbPairs.map(entry => entry.id))]
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0)
      .slice(0, 80)

    if (token && clientId && ids.length > 0) {
      try {
        const res = await fetch('https://api.igdb.com/v4/games', {
          method: 'POST',
          headers: {
            'Client-ID': clientId,
            Authorization: `Bearer ${token}`,
            accept: 'application/json',
          },
          body: `fields id,name,summary,cover.url,cover.image_id; where id = (${ids.join(',')}); limit ${ids.length};`,
          signal: AbortSignal.timeout(4500),
          next: { revalidate: 60 * 60 * 24 },
        })
        if (res.ok) {
          const json = await res.json()
          const byId = new Map<string, any>((Array.isArray(json) ? json : []).map((game: any) => [String(game.id), game]))
          for (const { item, id } of igdbPairs) {
            const game = byId.get(id)
            if (!game) continue
            out.set(item, {
              title: clean(game.name),
              description: clean(game.summary),
              coverImage: igdbCoverUrl(game.cover),
              externalId: `igdb-${id}`,
            })
          }
        }
      } catch {}
    }
  }

  return out
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

function candidateTitleForSearch(item: MediaLike): string | undefined {
  return clean(item.title)
    || clean(item.media_title)
    || clean(item.title_it)
    || clean(item.title_en)
    || clean(item.title_original)
    || clean(item.name)
}

function candidateYear(item: MediaLike): string | undefined {
  const raw = item.year || item.release_year || item.first_air_date || item.release_date
  if (typeof raw === 'number' && raw > 1800) return String(raw)
  if (typeof raw === 'string') {
    const match = raw.match(/(19|20)\d{2}/)
    if (match) return match[0]
  }
  return undefined
}

function normalizeTitleForCompare(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an|il|lo|la|gli|le|i|un|una|uno|di|del|della|dei|degli|delle)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titlesLikelyMatch(a: unknown, b: unknown): boolean {
  const left = normalizeTitleForCompare(a)
  const right = normalizeTitleForCompare(b)
  if (!left || !right) return true
  if (left === right || left.includes(right) || right.includes(left)) return true

  const leftTokens = new Set(left.split(' ').filter(t => t.length >= 3))
  const rightTokens = right.split(' ').filter(t => t.length >= 3)
  if (leftTokens.size === 0 || rightTokens.length === 0) return false

  const hits = rightTokens.filter(t => leftTokens.has(t)).length
  return hits >= Math.min(2, Math.ceil(Math.min(leftTokens.size, rightTokens.length) * 0.6))
}

async function resolveTmdbIdBySearch(item: MediaLike): Promise<string | null> {
  const token = process.env.TMDB_API_KEY
  const endpoint = tmdbEndpoint(item)
  const query = candidateTitleForSearch(item)
  if (!token || !endpoint || !query) return null

  const year = candidateYear(item)
  const yearParam = year ? `&${endpoint === 'movie' ? 'year' : 'first_air_date_year'}=${encodeURIComponent(year)}` : ''
  const languages: Array<'it-IT' | 'en-US'> = ['it-IT', 'en-US']

  for (const language of languages) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/${endpoint}?query=${encodeURIComponent(query)}&language=${language}${yearParam}`,
        {
          headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
          signal: AbortSignal.timeout(4500),
          next: { revalidate: 60 * 60 * 24 },
        },
      )
      if (!res.ok) continue
      const json = await res.json()
      const first = Array.isArray(json?.results) ? json.results.find((r: any) => r?.id) : null
      if (first?.id) return String(first.id)
    } catch {
      // prova la lingua successiva
    }
  }

  return null
}

async function fetchTmdbDetailsAndImages(
  endpoint: 'movie' | 'tv',
  id: string,
  locale: Locale,
  token: string,
): Promise<{ details: any; images: any }> {
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

  return {
    details: detailsRes.ok ? await detailsRes.json() : null,
    images: imagesRes.ok ? await imagesRes.json() : null,
  }
}

async function fetchOfficialTmdbLocaleAssets(
  item: MediaLike,
  locale: Locale,
): Promise<{ title?: string; coverImage?: string; tmdbExternalId?: string }> {
  const token = process.env.TMDB_API_KEY
  const endpoint = tmdbEndpoint(item)
  if (!token || !endpoint) return {}

  const directId = tmdbId(item)
  let id = directId || await resolveTmdbIdBySearch(item)
  if (!id) return {}

  try {
    let { details, images } = await fetchTmdbDetailsAndImages(endpoint, id, locale, token)

    // Protezione anti-ID sporchi: se un record dice “The Bear” ma l'external_id punta
    // a un'altra serie/film, non facciamo sovrascrivere il titolo corretto dal media sbagliato.
    // In quel caso proviamo una ricerca TMDb per titolo/anno e usiamo l'ID trovato.
    const candidateTitle = candidateTitleForSearch(item)
    const tmdbTitle = clean(details?.title || details?.name || details?.original_title || details?.original_name)
    if (directId && candidateTitle && tmdbTitle && !titlesLikelyMatch(candidateTitle, tmdbTitle)) {
      const searchedId = await resolveTmdbIdBySearch(item)
      if (searchedId && searchedId !== id) {
        id = searchedId
        ;({ details, images } = await fetchTmdbDetailsAndImages(endpoint, id, locale, token))
      }
    }

    return {
      title: clean(details?.title || details?.name),
      coverImage: pickPoster(images?.posters || [], locale) || tmdbImage(details?.poster_path),
      tmdbExternalId: `tmdb-${endpoint}-${id}`,
    }
  } catch {
    return {}
  }
}

function descriptionFor(item: MediaLike, locale: Locale): string | undefined {
  return clean(item.localized?.[locale]?.description) || clean(item[`description_${locale}`])
}

function titleFor(item: MediaLike, locale: Locale): string | undefined {
  if (locale === 'it') {
    return clean(item.localized?.it?.title) || clean(item.title_it) || clean(item.title) || clean(item.media_title) || clean(item.title_en) || clean(item.title_original)
  }

  return clean(item.localized?.en?.title) || clean(item.title_en) || clean(item.title_original) || clean(item.title) || clean(item.media_title) || clean(item.title_it)
}

function coverFor(item: MediaLike, locale: Locale): string | undefined {
  return clean(item.localized?.[locale]?.coverImage)
    || clean(item[`cover_image_${locale}`])
    || clean(item[`coverImage_${locale}`])
    || clean(item.coverImage)
    || clean(item.cover_image)
    || clean(item.media_cover)
}

function candidateDescription(item: MediaLike): { text?: string; sourceLocale: Locale } {
  const en = clean(item.localized?.en?.description) || clean(item.description_en)
  if (en) return { text: en, sourceLocale: 'en' }

  const it = clean(item.localized?.it?.description) || clean(item.description_it)
  if (it) return { text: it, sourceLocale: 'it' }

  const desc = clean(item.description)
  if (!desc) return { sourceLocale: 'en' }
  return { text: desc, sourceLocale: languageGuess(desc) || 'en' }
}

function translationId(item: MediaLike, sourceLocale: Locale, targetLocale: Locale) {
  const source = item.source || item.type || item.media_type || 'media'
  const id = item.external_id || item.media_id || item.id || item.appid || item.title || item.media_title || 'unknown'
  return `${source}:${id}:description:${sourceLocale}->${targetLocale}`
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const locale = await getRequestLocale(request)
  const items = Array.isArray(body?.items) ? body.items.slice(0, 100) : []
  if (items.length === 0) return NextResponse.json({ items: [] })

  const out = items.map((item: MediaLike) => ({ ...item }))

  const tmdbTitleItems = out
    .filter((item: MediaLike) => isTmdbTitleType(item))
    .slice(0, 80)

  if (tmdbTitleItems.length > 0) {
    const results = await Promise.allSettled(
      tmdbTitleItems.map(async (item: MediaLike) => ({ item, ...(await fetchOfficialTmdbLocaleAssets(item, locale)) })),
    )

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const title = clean(result.value.title)
      const coverImage = clean(result.value.coverImage)
      const tmdbExternalId = clean(result.value.tmdbExternalId)
      if (!title && !coverImage) continue

      const item = result.value.item
      if (tmdbExternalId) {
        item.external_id = item.external_id || tmdbExternalId
        item.id = item.id || tmdbExternalId
      }
      if (title) {
        item[`title_${locale}`] = title
        item.title = title
        item.media_title = title
      }
      if (coverImage) {
        item[`cover_image_${locale}`] = coverImage
        item.coverImage = coverImage
        item.cover_image = coverImage
        item.media_cover = coverImage
      }
      item.localized = {
        ...(item.localized || {}),
        [locale]: {
          ...(item.localized?.[locale] || {}),
          ...(title ? { title } : {}),
          ...(coverImage ? { coverImage } : {}),
          ...(descriptionFor(item, locale) ? { description: descriptionFor(item, locale) } : {}),
        },
      }
    }
  }

  const gameItems = out
    .filter((item: MediaLike) => isGameType(item))
    .slice(0, 80)

  if (gameItems.length > 0) {
    const assetsByItem = await fetchOfficialGameLocaleAssetsBatch(gameItems, locale)

    for (const item of gameItems) {
      const assets = assetsByItem.get(item)
      if (!assets) continue
      const title = clean(assets.title)
      const description = clean(assets.description)
      const coverImage = clean(assets.coverImage)
      const externalId = clean(assets.externalId)
      if (!title && !description && !coverImage) continue

      if (externalId) {
        item.external_id = externalId
        item.id = externalId
      }
      if (title) {
        item[`title_${locale}`] = title
        item.title = title
        item.media_title = title
      }
      if (description) {
        item[`description_${locale}`] = description
        item.description = description
      }
      if (coverImage) {
        item[`cover_image_${locale}`] = coverImage
        item.coverImage = coverImage
        item.cover_image = coverImage
        item.media_cover = coverImage
      }
      item.localized = {
        ...(item.localized || {}),
        [locale]: {
          ...(item.localized?.[locale] || {}),
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          ...(coverImage ? { coverImage } : {}),
        },
      }
    }
  }

  const missingDescriptions = out
    .filter((item: MediaLike) => !descriptionFor(item, locale))
    .map((item: MediaLike) => ({ item, ...candidateDescription(item) }))
    .filter((entry: any) => Boolean(entry.text))
    .filter((entry: any) => entry.sourceLocale !== locale)
    .slice(0, 60)

  if (missingDescriptions.length > 0) {
    const targetLang = locale === 'it' ? 'IT' : 'EN-US'
    const sourceLang = locale === 'it' ? 'EN' : 'IT'
    const translated = await translateWithCache(
      missingDescriptions.map((entry: any) => ({
        id: translationId(entry.item, entry.sourceLocale, locale),
        text: entry.text,
      })),
      targetLang,
      sourceLang,
    )

    for (const entry of missingDescriptions) {
      const text = clean(translated[translationId(entry.item, entry.sourceLocale, locale)])
      if (!text) continue
      entry.item[`description_${locale}`] = text
      entry.item.localized = {
        ...(entry.item.localized || {}),
        [locale]: {
          ...(entry.item.localized?.[locale] || {}),
          title: titleFor(entry.item, locale),
          description: text,
          ...(coverFor(entry.item, locale) ? { coverImage: coverFor(entry.item, locale) } : {}),
        },
      }
    }
  }

  const localized = out.map((item: MediaLike) => {
    const title = titleFor(item, locale) || item.title || item.media_title
    const cover = coverFor(item, locale)
    const description = descriptionFor(item, locale) || clean(item.description) || item.description
    return {
      ...item,
      title,
      media_title: title,
      coverImage: cover,
      cover_image: cover,
      media_cover: cover,
      description,
    }
  })

  return NextResponse.json({ items: localized })
}
