#!/usr/bin/env node
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const args = new Map(
  process.argv.slice(2).map(arg => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  }),
)

const targetPerType = Number(args.get('target') || 800)
const pageLimit = Number(args.get('pages') || 12)
const batchSize = Math.max(25, Math.min(500, Number(args.get('batch') || 250)))
const typesArg = String(args.get('types') || 'anime,manga,movie,tv,game')
const mediaTypes = typesArg.split(',').map(type => type.trim()).filter(Boolean)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const tmdbToken = process.env.TMDB_API_KEY || process.env.TMDB_READ_ACCESS_TOKEN
const igdbClientId = process.env.IGDB_CLIENT_ID || process.env.TWITCH_CLIENT_ID
const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET

if (!supabaseUrl || !serviceKey) {
  console.error('[media-catalog] Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

function cleanText(value, max = 2500) {
  if (typeof value !== 'string') return null
  const clean = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
  return clean || null
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ''))
}

function localizedBlock({ title, description, coverImage }) {
  return cleanObject({ title, description, coverImage })
}

function uniqueByKey(items, keyFn) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function qualityScore(row) {
  let quality = 0
  const score = Number(row.score || 0)
  if (score >= 85) quality += 35
  else if (score >= 75) quality += 28
  else if (score >= 68) quality += 18
  else if (score >= 60) quality += 10
  if (row.cover_image) quality += 20
  if (row.description || row.description_en || row.description_it) quality += 10
  if (Array.isArray(row.genres) && row.genres.length > 0) quality += 8
  if (Number(row.year || 0) >= new Date().getFullYear() - 2) quality += 4
  return Math.max(25, Math.min(100, quality))
}

async function upsertRows(rows) {
  const cleanRows = rows
    .filter(row => row.media_type && row.external_id && row.title && row.cover_image)
    .map(row => ({
      ...row,
      title_original: row.title_original || row.title,
      genres: Array.isArray(row.genres) ? row.genres.slice(0, 24) : [],
      popularity_score: Math.max(0, Math.min(100, Math.round(Number(row.popularity_score ?? row.score ?? 0)))),
      quality_score: row.quality_score ?? qualityScore(row),
      localized: row.localized || {},
      extra: row.extra || {},
    }))

  if (cleanRows.length === 0) return 0
  let total = 0
  for (let index = 0; index < cleanRows.length; index += batchSize) {
    const batch = cleanRows.slice(index, index + batchSize)
    const { data, error } = await supabase.rpc('upsert_media_catalog_items', { p_items: batch })
    if (error) throw error
    total += Number(data || batch.length)
  }
  return total
}

async function currentCount(type) {
  const { count, error } = await supabase
    .from('media_catalog')
    .select('external_id', { count: 'exact', head: true })
    .eq('media_type', type)
  if (error) return 0
  return count || 0
}

const ANILIST_QUERY = `
query ($type: MediaType, $page: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: 50) {
    media(type: $type, sort: $sort, isAdult: false) {
      id
      format
      title { romaji english native }
      coverImage { extraLarge large }
      startDate { year }
      seasonYear
      genres
      averageScore
      popularity
      description(asHtml: false)
    }
  }
}`

function anilistTitle(title) {
  return cleanText(title?.english, 300) || cleanText(title?.romaji, 300) || cleanText(title?.native, 300)
}

async function fetchAniList(type) {
  const mediaType = type === 'anime' ? 'ANIME' : 'MANGA'
  const sorts = [['POPULARITY_DESC'], ['TRENDING_DESC'], ['SCORE_DESC'], ['FAVOURITES_DESC']]
  const rows = []

  for (const sort of sorts) {
    for (let page = 1; page <= pageLimit; page++) {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ANILIST_QUERY, variables: { type: mediaType, page, sort } }),
      })
      if (!res.ok) continue
      const json = await res.json().catch(() => null)
      const media = json?.data?.Page?.media || []
      for (const item of media) {
        if (type === 'anime' && item?.format === 'MOVIE') continue
        const title = anilistTitle(item.title)
        const cover = item?.coverImage?.extraLarge || item?.coverImage?.large
        if (!title || !cover) continue
        const year = item?.seasonYear || item?.startDate?.year || null
        const description = cleanText(item.description)
        const titleEn = cleanText(item.title?.english, 300)
        const score = Number(item.averageScore || 0)
        rows.push({
          media_type: type,
          external_id: `anilist-${type}-${item.id}`,
          title,
          title_original: cleanText(item.title?.romaji, 300) || title,
          title_en: titleEn,
          description,
          description_en: description,
          cover_image: cover,
          year,
          genres: Array.isArray(item.genres) ? item.genres : [],
          score,
          popularity_score: Math.max(score, Math.min(100, Math.round(Number(item.popularity || 0) / 2500))),
          source: 'anilist',
          localized: { en: localizedBlock({ title: titleEn || title, description, coverImage: cover }) },
          extra: { popularity: item.popularity, sort: sort.join(',') },
        })
      }
      if (rows.length >= targetPerType * 1.35) break
    }
    if (rows.length >= targetPerType * 1.35) break
  }

  return uniqueByKey(rows, row => row.external_id).slice(0, targetPerType)
}

function tmdbHeaders() {
  return { Authorization: `Bearer ${tmdbToken}`, Accept: 'application/json' }
}

function tmdbImage(pathValue) {
  return pathValue ? `https://image.tmdb.org/t/p/w500${pathValue}` : null
}

async function fetchTmdb(type) {
  if (!tmdbToken) {
    console.warn(`[media-catalog] TMDB token missing, skipping ${type}`)
    return []
  }
  const endpoint = type === 'movie' ? 'movie' : 'tv'
  const sortPlans = [
    { sort_by: 'popularity.desc', vote_count: type === 'movie' ? 250 : 100, vote_average: 6.2 },
    { sort_by: 'vote_average.desc', vote_count: type === 'movie' ? 500 : 200, vote_average: 7.0 },
    { sort_by: type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc', vote_count: type === 'movie' ? 80 : 50, vote_average: 6.0 },
  ]
  const rows = []

  async function fetchDiscoverPage(plan, page, language) {
    const params = new URLSearchParams({
      language,
      include_adult: 'false',
      include_null_first_air_dates: 'false',
      sort_by: plan.sort_by,
      'vote_count.gte': String(plan.vote_count),
      'vote_average.gte': String(plan.vote_average),
      page: String(page),
    })
    const res = await fetch(`https://api.themoviedb.org/3/discover/${endpoint}?${params}`, { headers: tmdbHeaders() })
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    return Array.isArray(json?.results) ? json.results : []
  }

  for (const plan of sortPlans) {
    for (let page = 1; page <= pageLimit; page++) {
      const [itItems, enItems] = await Promise.all([
        fetchDiscoverPage(plan, page, 'it-IT'),
        fetchDiscoverPage(plan, page, 'en-US'),
      ])
      const byId = new Map()
      for (const item of enItems) byId.set(item.id, { en: item })
      for (const item of itItems) byId.set(item.id, { ...(byId.get(item.id) || {}), it: item })

      for (const pair of byId.values()) {
        const it = pair.it || pair.en
        const en = pair.en || pair.it
        const titleIt = cleanText(it?.title || it?.name, 300)
        const titleEn = cleanText(en?.title || en?.name, 300)
        const originalTitle = cleanText(en?.original_title || en?.original_name || it?.original_title || it?.original_name, 300)
        const title = titleIt || titleEn || originalTitle
        const item = it || en
        const cover = tmdbImage(item.poster_path)
        if (!title || !cover) continue
        const descriptionIt = cleanText(it?.overview)
        const descriptionEn = cleanText(en?.overview)
        const description = descriptionIt || descriptionEn
        const year = Number(String(item.release_date || item.first_air_date || '').slice(0, 4)) || null
        const score = Math.round(Number(item.vote_average || 0) * 10)
        const localized = {}
        if (titleIt || descriptionIt) localized.it = localizedBlock({ title: titleIt, description: descriptionIt, coverImage: cover })
        if (titleEn || descriptionEn) localized.en = localizedBlock({ title: titleEn, description: descriptionEn, coverImage: cover })
        rows.push({
          media_type: type,
          external_id: `tmdb-${type}-${item.id}`,
          title,
          title_original: originalTitle || title,
          title_en: titleEn,
          title_it: titleIt,
          description,
          description_en: descriptionEn,
          description_it: descriptionIt,
          cover_image: cover,
          cover_image_en: cover,
          cover_image_it: cover,
          year,
          genres: [],
          score,
          popularity_score: Math.max(score, Math.min(100, Math.round(Number(item.popularity || 0)))),
          source: 'tmdb',
          localized,
          extra: { vote_count: item.vote_count, popularity: item.popularity, sort_by: plan.sort_by },
        })
      }
      if (rows.length >= targetPerType * 1.35) break
    }
    if (rows.length >= targetPerType * 1.35) break
  }

  return uniqueByKey(rows, row => row.external_id).slice(0, targetPerType)
}

let igdbToken = null
async function getIgdbToken() {
  if (igdbToken) return igdbToken
  if (!igdbClientId || !igdbClientSecret) return null
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: igdbClientId,
      client_secret: igdbClientSecret,
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  igdbToken = json.access_token || null
  return igdbToken
}

function igdbCover(imageId) {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg` : null
}

async function fetchIgdbGames() {
  const token = await getIgdbToken()
  if (!token) {
    console.warn('[media-catalog] IGDB credentials missing, skipping game')
    return []
  }

  const headers = {
    'Client-ID': igdbClientId,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
  const fields = 'fields name,summary,storyline,cover.image_id,first_release_date,genres.name,total_rating,aggregated_rating,rating,total_rating_count,hypes,category;'
  const queryPlans = [
    'where cover != null & category = 0 & total_rating_count > 50; sort total_rating_count desc;',
    'where cover != null & category = 0 & rating > 70; sort rating desc;',
    'where cover != null & category = 0 & hypes > 0; sort hypes desc;',
    'where cover != null & total_rating_count > 100; sort total_rating_count desc;',
  ]
  const rows = []

  for (const whereSort of queryPlans) {
    for (let page = 0; page < pageLimit; page++) {
      const body = `${fields} ${whereSort} limit 50; offset ${page * 50};`
      const res = await fetch('https://api.igdb.com/v4/games', { method: 'POST', headers, body })
      if (!res.ok) continue
      const games = await res.json().catch(() => [])
      for (const game of games || []) {
        const title = cleanText(game.name, 300)
        const cover = igdbCover(game.cover?.image_id)
        if (!title || !cover) continue
        const description = cleanText(game.summary || game.storyline)
        const year = game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null
        const score = Math.round(Number(game.total_rating || game.aggregated_rating || game.rating || 0))
        rows.push({
          media_type: 'game',
          external_id: `igdb-${game.id}`,
          title,
          title_original: title,
          title_en: title,
          description,
          description_en: description,
          cover_image: cover,
          year,
          genres: Array.isArray(game.genres) ? game.genres.map(genre => genre.name).filter(Boolean) : [],
          score,
          popularity_score: Math.max(score, Math.min(100, Math.round(Number(game.total_rating_count || 0) / 100))),
          source: 'igdb',
          localized: { en: localizedBlock({ title, description, coverImage: cover }) },
          extra: { total_rating_count: game.total_rating_count, hypes: game.hypes },
        })
      }
      if (rows.length >= targetPerType * 1.35) break
    }
    if (rows.length >= targetPerType * 1.35) break
  }

  return uniqueByKey(rows, row => row.external_id).slice(0, targetPerType)
}

async function run() {
  console.log(`[media-catalog] target=${targetPerType}, pages=${pageLimit}, batch=${batchSize}, types=${mediaTypes.join(',')}`)
  for (const type of mediaTypes) {
    const before = await currentCount(type)
    console.log(`[media-catalog] ${type}: before=${before}`)
    let rows = []
    if (type === 'anime' || type === 'manga') rows = await fetchAniList(type)
    else if (type === 'movie' || type === 'tv') rows = await fetchTmdb(type)
    else if (type === 'game') rows = await fetchIgdbGames()
    else {
      console.warn(`[media-catalog] unsupported type=${type}`)
      continue
    }

    const inserted = await upsertRows(rows)
    const after = await currentCount(type)
    console.log(`[media-catalog] ${type}: fetched=${rows.length}, upserted=${inserted}, after=${after}`)
  }
}

run().catch(error => {
  console.error('[media-catalog] failed', error)
  process.exit(1)
})
