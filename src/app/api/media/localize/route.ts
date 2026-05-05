import { NextRequest, NextResponse } from 'next/server'
import { getRequestLocale, type Locale } from '@/lib/i18n/serverLocale'
import { translateWithCache } from '@/lib/deepl'
import { readMediaLocaleAssets, mergeCachedLocaleAsset, writeMediaLocaleAssets, mediaLocaleKeyFor, mediaLocaleItemIsComplete } from '@/lib/i18n/mediaLocalePersistentCache'

type MediaLike = Record<string, any>

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const bad = text.toLowerCase()
  if (bad === 'null' || bad === 'undefined' || bad === 'nan' || bad === 'n/a' || bad === 'none') return undefined
  return text
}

function stripHtml(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s*\((?:source|fonte|fonti)\s*:[^)]+\)\s*$/gi, '')
    .replace(/\s*(?:source|fonte|fonti)\s*:[^\n]+$/gi, '')
  return clean(text)
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

function isAnilistTitleType(item: MediaLike): boolean {
  const type = normalizeType(item.type || item.media_type)
  return type === 'anime' || type === 'manga' || type === 'novel'
}

function anilistId(item: MediaLike): number | null {
  const candidates = [item.external_id, item.media_id, item.id, item.anilist_id]
  for (const value of candidates) {
    const raw = String(value || '').trim()
    if (!raw) continue
    const prefixed = raw.match(/anilist-(?:anime|manga|novel)-(\d+)/i) || raw.match(/anilist[-:](\d+)/i)
    if (prefixed?.[1]) return Number(prefixed[1])
    const type = normalizeType(item.type || item.media_type)
    if ((item.source === 'anilist' || item.provider === 'anilist' || type === 'anime' || type === 'manga') && /^\d+$/.test(raw)) return Number(raw)
  }
  return null
}


function normalizeAniListSearchTitle(value: unknown): string | undefined {
  const raw = clean(value)
  if (!raw) return undefined

  const withoutSource = raw
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const parts = withoutSource
    .split(/\s[-–—:]\s|[:：]/)
    .map(part => part.trim())
    .filter(Boolean)

  const first = parts[0] || withoutSource
  return clean(first.length >= 3 ? first : withoutSource)
}

function aniListSearchCandidates(item: MediaLike): string[] {
  const values = [
    item.title_en,
    item.title_original,
    item.title,
    item.media_title,
    item.name,
    item.title_it,
    item.localized?.en?.title,
    item.localized?.it?.title,
  ]

  const out: string[] = []
  for (const value of values) {
    const full = clean(value)
    const short = normalizeAniListSearchTitle(value)
    for (const candidate of [full, short]) {
      if (candidate && candidate.length >= 3 && !out.some(existing => existing.toLowerCase() === candidate.toLowerCase())) {
        out.push(candidate)
      }
    }
  }
  return out.slice(0, 4)
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

function bggId(item: MediaLike): string | null {
  const candidates = [item.external_id, item.media_id, item.id, item.bgg_id]
  for (const value of candidates) {
    const raw = String(value || '').trim()
    if (!raw) continue
    const prefixed = raw.match(/bgg[-:](\d+)/i)
    if (prefixed?.[1]) return prefixed[1]
    if ((item.source === 'bgg' || item.provider === 'bgg') && /^\d+$/.test(raw)) return raw
  }
  return null
}

function isBoardgameType(item: MediaLike): boolean {
  return normalizeType(item.type || item.media_type) === 'boardgame'
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

function xmlText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? clean(decodeXmlEntities(match[1]).replace(/<[^>]+>/g, ' ')) : undefined
}

function xmlNumber(xml: string, tag: string): number | undefined {
  const raw = xmlText(xml, tag)
  if (!raw) return undefined
  const num = Number(raw)
  return Number.isFinite(num) ? num : undefined
}

function bggStatAverage(xml: string, tag: string): number | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*value=["']([^"']+)["'][^>]*\/?\s*>`, 'i'))
  const num = match?.[1] ? Number(match[1]) : NaN
  return Number.isFinite(num) ? num : undefined
}

function bggLinkValues(xml: string, type: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<link[^>]*type=["']${type}["'][^>]*value=["']([^"']+)["'][^>]*\/?\s*>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const value = clean(decodeXmlEntities(match[1]))
    if (value && !out.includes(value)) out.push(value)
  }
  return out
}

function bggPrimaryName(xml: string): string | undefined {
  const primary = xml.match(/<name[^>]*type=["']primary["'][^>]*value=["']([^"']+)["'][^>]*\/?>/i)
  if (primary?.[1]) return clean(decodeXmlEntities(primary[1]))
  const any = xml.match(/<name[^>]*value=["']([^"']+)["'][^>]*\/?>/i)
  return any?.[1] ? clean(decodeXmlEntities(any[1])) : undefined
}

async function fetchBggBoardgameAssets(
  item: MediaLike,
): Promise<{ title?: string; description?: string; coverImage?: string; externalId?: string; descriptionLocale?: Locale; year?: number; score?: number; min_players?: number; max_players?: number; playing_time?: number; complexity?: number; mechanics?: string[]; designers?: string[]; genres?: string[] }> {
  const id = bggId(item)
  if (!id) return {}

  try {
    const res = await fetch(`https://boardgamegeek.com/xmlapi2/thing?id=${encodeURIComponent(id)}&stats=1`, {
      headers: { accept: 'application/xml,text/xml,*/*' },
      signal: AbortSignal.timeout(6500),
      next: { revalidate: 60 * 60 * 24 },
    })
    if (!res.ok) return {}
    const xml = await res.text()
    return {
      title: bggPrimaryName(xml),
      description: xmlText(xml, 'description'),
      coverImage: xmlText(xml, 'image') || xmlText(xml, 'thumbnail'),
      externalId: `bgg-${id}`,
      descriptionLocale: 'en',
      year: xmlNumber(xml, 'yearpublished'),
      score: (() => { const avg = bggStatAverage(xml, 'average'); return avg != null ? Math.round((avg / 2) * 10) / 10 : undefined })(),
      min_players: xmlNumber(xml, 'minplayers'),
      max_players: xmlNumber(xml, 'maxplayers'),
      playing_time: xmlNumber(xml, 'playingtime'),
      complexity: bggStatAverage(xml, 'averageweight'),
      mechanics: bggLinkValues(xml, 'boardgamemechanic'),
      designers: bggLinkValues(xml, 'boardgamedesigner'),
      genres: bggLinkValues(xml, 'boardgamecategory'),
    }
  } catch {
    return {}
  }
}


function steamLanguage(locale: Locale): 'italian' | 'english' {
  return locale === 'it' ? 'italian' : 'english'
}

async function fetchSteamGameLocaleAssets(
  item: MediaLike,
  locale: Locale,
): Promise<MediaLike> {
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
      description: stripHtml(data.about_the_game) || clean(data.short_description),
      coverImage: clean(data.header_image) || clean(data.capsule_image) || clean(data.capsule_imagev5),
      externalId: `steam-${appId}`,
      descriptionLocale: locale,
      year: (() => { const date = clean(data.release_date?.date); const m = date?.match(/(19|20)\d{2}/); return m ? Number(m[0]) : undefined })(),
      genres: Array.isArray(data.genres) ? data.genres.map((g: any) => clean(g?.description)).filter(Boolean) : undefined,
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
): Promise<MediaLike> {
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
      body: `fields name,summary,cover.url,cover.image_id,first_release_date,total_rating,aggregated_rating,genres.name; where id = ${Number(id)}; limit 1;`,
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
      descriptionLocale: 'en',
      year: game.first_release_date ? new Date(Number(game.first_release_date) * 1000).getUTCFullYear() : undefined,
      score: (() => { const rating = Number(game.total_rating || game.aggregated_rating); return Number.isFinite(rating) ? Math.round((rating / 20) * 10) / 10 : undefined })(),
      genres: Array.isArray(game.genres) ? game.genres.map((g: any) => clean(g?.name)).filter(Boolean) : undefined,
    }
  } catch {
    return {}
  }
}

async function fetchOfficialGameLocaleAssets(
  item: MediaLike,
  locale: Locale,
): Promise<MediaLike> {
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
): Promise<Map<MediaLike, MediaLike>> {
  const out = new Map<MediaLike, MediaLike>()
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
            description: stripHtml(data.about_the_game) || clean(data.short_description),
            coverImage: clean(data.header_image) || clean(data.capsule_image) || clean(data.capsule_imagev5),
            externalId: `steam-${id}`,
            descriptionLocale: locale,
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
          body: `fields id,name,summary,cover.url,cover.image_id,first_release_date,total_rating,aggregated_rating,genres.name; where id = (${ids.join(',')}); limit ${ids.length};`,
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
              descriptionLocale: 'en',
              year: game.first_release_date ? new Date(Number(game.first_release_date) * 1000).getUTCFullYear() : undefined,
              score: (() => { const rating = Number(game.total_rating || game.aggregated_rating); return Number.isFinite(rating) ? Math.round((rating / 20) * 10) / 10 : undefined })(),
              genres: Array.isArray(game.genres) ? game.genres.map((g: any) => clean(g?.name)).filter(Boolean) : undefined,
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
): Promise<{ title?: string; description?: string; coverImage?: string; tmdbExternalId?: string; year?: number; score?: number; genres?: string[]; episodes?: number; totalSeasons?: number }> {
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
      description: clean(details?.overview),
      coverImage: pickPoster(images?.posters || [], locale) || tmdbImage(details?.poster_path),
      tmdbExternalId: `tmdb-${endpoint}-${id}`,
      year: (() => { const raw = endpoint === 'movie' ? details?.release_date : details?.first_air_date; const m = clean(raw)?.match(/(19|20)\d{2}/); return m ? Number(m[0]) : undefined })(),
      score: (() => { const vote = Number(details?.vote_average); return Number.isFinite(vote) && vote > 0 ? Math.round((vote / 2) * 10) / 10 : undefined })(),
      genres: Array.isArray(details?.genres) ? details.genres.map((g: any) => clean(g?.name)).filter(Boolean) : undefined,
      episodes: endpoint === 'tv' ? Number(details?.number_of_episodes) || undefined : undefined,
      totalSeasons: endpoint === 'tv' ? Number(details?.number_of_seasons) || undefined : undefined,
    }
  } catch {
    return {}
  }
}

async function fetchOfficialAniListAssetsBatch(
  items: MediaLike[],
): Promise<Map<MediaLike, MediaLike>> {
  const out = new Map<MediaLike, MediaLike>()
  const pairsWithId = items
    .map(item => ({ item, id: anilistId(item) }))
    .filter((entry): entry is { item: MediaLike; id: number } => typeof entry.id === 'number' && Number.isFinite(entry.id) && entry.id > 0)
    .slice(0, 80)

  const mediaFields = `
    id
    type
    title { romaji english native }
    coverImage { extraLarge large }
    description(asHtml: false)
    genres
    averageScore
    episodes
    chapters
    startDate { year }
    studios(isMain: true) { nodes { name } }
  `

  const applyRow = (item: MediaLike, row: any) => {
    if (!row) return
    const normalizedType = normalizeType(item.type || item.media_type)
    const apiType = String(row.type || '').toLowerCase()
    const type = normalizedType === 'manga' || apiType === 'manga' ? 'manga' : 'anime'
    out.set(item, {
      title: clean(row.title?.english) || clean(row.title?.romaji) || clean(row.title?.native),
      titleOriginal: clean(row.title?.romaji) || clean(row.title?.native),
      descriptionEn: stripHtml(row.description),
      coverImage: clean(row.coverImage?.extraLarge) || clean(row.coverImage?.large),
      externalId: `anilist-${type}-${Number(row.id)}`,
      year: typeof row.startDate?.year === 'number' ? row.startDate.year : undefined,
      score: typeof row.averageScore === 'number' ? Math.round((row.averageScore / 20) * 10) / 10 : undefined,
      genres: Array.isArray(row.genres) ? row.genres.filter(Boolean) : undefined,
      episodes: type === 'manga' ? (Number(row.chapters) || undefined) : (Number(row.episodes) || undefined),
      studios: Array.isArray(row.studios?.nodes) ? row.studios.nodes.map((n: any) => clean(n?.name)).filter(Boolean) : undefined,
    })
  }

  if (pairsWithId.length > 0) {
    const query = `
      query ($ids: [Int]) {
        Page(page: 1, perPage: 80) {
          media(id_in: $ids) { ${mediaFields} }
        }
      }
    `

    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables: { ids: [...new Set(pairsWithId.map(entry => entry.id))] } }),
        signal: AbortSignal.timeout(4500),
        next: { revalidate: 60 * 60 * 24 },
      })
      if (res.ok) {
        const json = await res.json()
        const rows = Array.isArray(json?.data?.Page?.media) ? json.data.Page.media : []
        const byId = new Map<number, any>(rows.map((row: any) => [Number(row.id), row]))
        for (const { item, id } of pairsWithId) applyRow(item, byId.get(id))
      }
    } catch {}
  }

  const unresolved = items
    .filter(item => !out.has(item))
    .filter(item => isAnilistTitleType(item))
    .slice(0, 24)

  if (unresolved.length > 0) {
    const searchQuery = `
      query ($search: String, $type: MediaType) {
        Page(page: 1, perPage: 5) {
          media(search: $search, type: $type, sort: SEARCH_MATCH, isAdult: false) { ${mediaFields} }
        }
      }
    `

    for (const item of unresolved) {
      const type = normalizeType(item.type || item.media_type)
      const apiType = type === 'manga' || type === 'novel' ? 'MANGA' : 'ANIME'
      for (const search of aniListSearchCandidates(item)) {
        try {
          const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ query: searchQuery, variables: { search, type: apiType } }),
            signal: AbortSignal.timeout(4500),
            next: { revalidate: 60 * 60 * 24 },
          })
          if (!res.ok) continue
          const json = await res.json()
          const rows = Array.isArray(json?.data?.Page?.media) ? json.data.Page.media : []
          const row = rows.find((entry: any) => entry?.id) || null
          if (!row) continue
          applyRow(item, row)
          break
        } catch {
          // prova il prossimo candidato
        }
      }
    }
  }

  return out
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


function applyDetailFields(item: MediaLike, details: MediaLike) {
  const detailKeys = ['year', 'score', 'genres', 'episodes', 'totalSeasons', 'studios', 'min_players', 'max_players', 'playing_time', 'complexity', 'mechanics', 'designers']
  for (const key of detailKeys) {
    const value = details[key]
    if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) item[key] = value
  }
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const locale = await getRequestLocale(request)
  const mode: 'basic' | 'full' = body?.mode === 'full' ? 'full' : 'basic'
  const dualLocaleWindow = request.headers.get('x-geekore-locale-dual') === '1'
    || request.nextUrl.searchParams.get('dualLocale') === '1'
  const items = Array.isArray(body?.items) ? body.items.slice(0, 100) : []
  if (items.length === 0) return NextResponse.json({ items: [] })

  const out = items.map((item: MediaLike) => ({ ...item }))

  // Prima lettura: cache persistente Supabase per media + lingua.
  // Se l'utente resta sempre nella stessa lingua, dopo il primo popolamento
  // le pagine non devono più richiamare provider esterni per gli stessi media.
  const cachedAssets = await readMediaLocaleAssets(out, locale)
  out.forEach((item: MediaLike, index: number) => {
    const key = mediaLocaleKeyFor(item)
    const cached = key ? cachedAssets.get(key) : null
    if (cached) out[index] = mergeCachedLocaleAsset(item, cached, locale)
  })

  const tmdbTitleItems = out
    .filter((item: MediaLike) => !mediaLocaleItemIsComplete(item, locale, mode) && isTmdbTitleType(item))
    .slice(0, 80)

  if (tmdbTitleItems.length > 0) {
    const results = await Promise.allSettled(
      tmdbTitleItems.map(async (item: MediaLike) => ({ item, ...(await fetchOfficialTmdbLocaleAssets(item, locale)) })),
    )

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const title = clean(result.value.title)
      const description = clean(result.value.description)
      const coverImage = clean(result.value.coverImage)
      const tmdbExternalId = clean(result.value.tmdbExternalId)
      if (!title && !description && !coverImage) continue

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
      applyDetailFields(item, result.value)
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

  const anilistItems = out
    .filter((item: MediaLike) => !mediaLocaleItemIsComplete(item, locale, mode) && isAnilistTitleType(item))
    .slice(0, 80)

  if (anilistItems.length > 0) {
    const assetsByItem = await fetchOfficialAniListAssetsBatch(anilistItems)

    for (const item of anilistItems) {
      const assets = assetsByItem.get(item)
      if (!assets) continue
      const title = clean(assets.title)
      const titleOriginal = clean(assets.titleOriginal)
      const descriptionEn = clean(assets.descriptionEn)
      const coverImage = clean(assets.coverImage)
      const externalId = clean(assets.externalId)
      if (!title && !descriptionEn && !coverImage) continue

      if (externalId) {
        item.external_id = item.external_id || externalId
        item.id = item.id || externalId
      }
      if (title) {
        item.title_en = title
        if (locale === 'en') {
          item.title = title
          item.media_title = title
        }
      }
      if (titleOriginal) item.title_original = item.title_original || titleOriginal
      if (descriptionEn) {
        item.description_en = descriptionEn
        if (locale === 'en') item.description = descriptionEn
      }
      if (coverImage) {
        item[`cover_image_${locale}`] = coverImage
        item.coverImage = coverImage
        item.cover_image = coverImage
        item.media_cover = coverImage
      }
      applyDetailFields(item, assets)
      item.localized = {
        ...(item.localized || {}),
        en: {
          ...(item.localized?.en || {}),
          ...(title ? { title } : {}),
          ...(descriptionEn ? { description: descriptionEn } : {}),
          ...(coverImage ? { coverImage } : {}),
        },
        [locale]: {
          ...(item.localized?.[locale] || {}),
          ...(locale === 'en' && title ? { title } : {}),
          ...(locale === 'en' && descriptionEn ? { description: descriptionEn } : {}),
          ...(coverImage ? { coverImage } : {}),
        },
      }
    }
  }

  const gameItems = out
    .filter((item: MediaLike) => !mediaLocaleItemIsComplete(item, locale, mode) && isGameType(item))
    .slice(0, 80)

  if (gameItems.length > 0) {
    const assetsByItem = await fetchOfficialGameLocaleAssetsBatch(gameItems, locale)

    for (const item of gameItems) {
      const assets = assetsByItem.get(item)
      if (!assets) continue
      const title = clean(assets.title)
      const description = clean(assets.description)
      const descriptionLocale = (assets.descriptionLocale || locale) as Locale
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
        item[`description_${descriptionLocale}`] = description
        if (descriptionLocale === locale) item.description = description
      }
      if (coverImage) {
        item[`cover_image_${locale}`] = coverImage
        item.coverImage = coverImage
        item.cover_image = coverImage
        item.media_cover = coverImage
      }
      applyDetailFields(item, assets)
      item.localized = {
        ...(item.localized || {}),
        [locale]: {
          ...(item.localized?.[locale] || {}),
          ...(title ? { title } : {}),
          ...(description && descriptionLocale === locale ? { description } : {}),
          ...(coverImage ? { coverImage } : {}),
        },
        ...(description && descriptionLocale !== locale ? {
          [descriptionLocale]: {
            ...(item.localized?.[descriptionLocale] || {}),
            description,
          },
        } : {}),
      }
    }
  }

  const boardgameItems = out
    .filter((item: MediaLike) => !mediaLocaleItemIsComplete(item, locale, mode) && isBoardgameType(item))
    .slice(0, 60)

  if (boardgameItems.length > 0) {
    const results = await Promise.allSettled(
      boardgameItems.map(async (item: MediaLike) => ({ item, ...(await fetchBggBoardgameAssets(item)) })),
    )

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const item = result.value.item
      const title = clean(result.value.title)
      const description = clean(result.value.description)
      const coverImage = clean(result.value.coverImage)
      const externalId = clean(result.value.externalId)
      if (!title && !description && !coverImage) continue

      if (externalId) {
        item.external_id = externalId
        item.id = externalId
      }
      if (title) {
        item.title_en = title
        item.title = title
        item.media_title = title
      }
      if (description) {
        item.description_en = description
        if (locale === 'en') item.description = description
      }
      if (coverImage) {
        item[`cover_image_${locale}`] = coverImage
        item.coverImage = coverImage
        item.cover_image = coverImage
        item.media_cover = coverImage
      }
      applyDetailFields(item, result.value)
      item.localized = {
        ...(item.localized || {}),
        en: {
          ...(item.localized?.en || {}),
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          ...(coverImage ? { coverImage } : {}),
        },
        [locale]: {
          ...(item.localized?.[locale] || {}),
          ...(locale === 'en' && title ? { title } : {}),
          ...(locale === 'en' && description ? { description } : {}),
          ...(coverImage ? { coverImage } : {}),
        },
      }
    }
  }

  const missingDescriptions = mode === 'full'
    ? out
      .filter((item: MediaLike) => !descriptionFor(item, locale))
      .map((item: MediaLike) => ({ item, ...candidateDescription(item) }))
      .filter((entry: any) => Boolean(entry.text))
      .filter((entry: any) => entry.sourceLocale !== locale)
      .slice(0, 60)
    : []

  if (mode === 'full' && missingDescriptions.length > 0) {
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
    const genericDescription = clean(item.description)
    const genericLocale = genericDescription ? languageGuess(genericDescription) : null
    const description = descriptionFor(item, locale)
      || (genericDescription && genericLocale === locale ? genericDescription : undefined)

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

  await writeMediaLocaleAssets(localized, locale, mode)

  // Warning zone 24h dopo cambio lingua: non blocchiamo la UI, ma quando nel payload
  // esistono già asset strict anche della lingua opposta li salviamo in modo sicuro.
  // Non cancelliamo mai asset globali dell'altra lingua: la cache è condivisa fra utenti.
  if (dualLocaleWindow) {
    const siblingLocale: Locale = locale === 'en' ? 'it' : 'en'
    await writeMediaLocaleAssets(localized, siblingLocale, mode)
  }

  return NextResponse.json({ items: localized })
}
