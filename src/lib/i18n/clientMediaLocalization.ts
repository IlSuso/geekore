'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale } from '@/lib/locale'
import type { Locale } from './serverLocale'

type MediaRow = Record<string, any>

export type MediaLocalizationOptions = {
  titleKeys?: string[]
  coverKeys?: string[]
  idKeys?: string[]
  typeKeys?: string[]
  descriptionKeys?: string[]
}

const DEFAULT_OPTIONS: Required<MediaLocalizationOptions> = {
  titleKeys: ['title', 'media_title', 'name'],
  coverKeys: ['coverImage', 'cover_image', 'media_cover'],
  idKeys: ['external_id', 'media_id', 'id'],
  typeKeys: ['type', 'media_type'],
  descriptionKeys: ['description', 'media_description'],
}

const CACHE_VERSION = 'v6-cover-title-refresh'
const memoryCache = new Map<string, MediaRow>()
const inflight = new Map<string, Promise<MediaRow[]>>()

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const bad = text.toLowerCase()
  if (bad === 'null' || bad === 'undefined' || bad === 'nan' || bad === 'n/a' || bad === 'none') return undefined
  return text
}

function mergeOptions(options?: MediaLocalizationOptions): Required<MediaLocalizationOptions> {
  return {
    titleKeys: options?.titleKeys?.length ? options.titleKeys : DEFAULT_OPTIONS.titleKeys,
    coverKeys: options?.coverKeys?.length ? options.coverKeys : DEFAULT_OPTIONS.coverKeys,
    idKeys: options?.idKeys?.length ? options.idKeys : DEFAULT_OPTIONS.idKeys,
    typeKeys: options?.typeKeys?.length ? options.typeKeys : DEFAULT_OPTIONS.typeKeys,
    descriptionKeys: options?.descriptionKeys?.length ? options.descriptionKeys : DEFAULT_OPTIONS.descriptionKeys,
  }
}

function firstValue(row: MediaRow | null | undefined, keys: string[]): any {
  if (!row) return undefined
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return undefined
}

function setFirstExistingOrFirst(row: MediaRow, keys: string[], value: any): MediaRow {
  if (value === undefined || value === null || String(value).trim() === '') return row
  const key = keys.find(k => Object.prototype.hasOwnProperty.call(row, k)) || keys[0]
  return { ...row, [key]: value }
}

function normalizeType(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'serie' || raw === 'series' || raw === 'tv_show' || raw === 'show') return 'tv'
  if (raw === 'film') return 'movie'
  if (raw === 'board_game' || raw === 'board-game' || raw === 'board') return 'boardgame'
  if (raw === 'videogame' || raw === 'video_game' || raw === 'video-game' || raw === 'games') return 'game'
  return raw
}

function stableText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function toLocalizationPayload(row: MediaRow, options: Required<MediaLocalizationOptions>) {
  const id = firstValue(row, options.idKeys)
  const title = firstValue(row, options.titleKeys)
  const type = firstValue(row, options.typeKeys)
  const cover = firstValue(row, options.coverKeys)
  const description = firstValue(row, options.descriptionKeys)

  return {
    ...row,
    id: id ?? row.id,
    external_id: row.external_id ?? id,
    title: row.title ?? title,
    type: row.type ?? type,
    coverImage: row.coverImage ?? cover,
    cover_image: row.cover_image ?? cover,
    description: row.description ?? description,
  }
}

function cacheKeyFor(row: MediaRow, locale: Locale, options: Required<MediaLocalizationOptions>): string | null {
  const id = clean(firstValue(row, options.idKeys)) || clean(row.external_id) || clean(row.media_id) || clean(row.id)
  const type = normalizeType(firstValue(row, options.typeKeys) || row.type || row.media_type || row.source || 'media')
  const title = clean(firstValue(row, options.titleKeys) || row.title || row.media_title || row.name)
  const identity = id || (title ? `title:${stableText(title)}` : null)
  if (!identity) return null
  return `${CACHE_VERSION}:${locale}:${type || 'media'}:${identity}`
}

function sessionKey(key: string) {
  return `geekore_media_locale:${key}`
}

function readSessionCache(key: string): MediaRow | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(sessionKey(key))
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const ts = Number(parsed.ts || 0)
    if (!ts || Date.now() - ts > 1000 * 60 * 60 * 12) return undefined
    return parsed.value && typeof parsed.value === 'object' ? parsed.value : undefined
  } catch {
    return undefined
  }
}

function writeSessionCache(key: string, value: MediaRow) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(sessionKey(key), JSON.stringify({ ts: Date.now(), value }))
  } catch {
    // sessionStorage può essere pieno o disabilitato: la cache in memoria basta.
  }
}

function readCache(key: string): MediaRow | undefined {
  const inMemory = memoryCache.get(key)
  if (inMemory) return inMemory
  const fromSession = readSessionCache(key)
  if (fromSession) {
    memoryCache.set(key, fromSession)
    return fromSession
  }
  return undefined
}

function writeCache(key: string, value: MediaRow) {
  memoryCache.set(key, value)
  writeSessionCache(key, value)
}

function localizedNode(row: MediaRow | undefined, locale: Locale): MediaRow | undefined {
  const node = row?.localized?.[locale]
  return node && typeof node === 'object' ? node : undefined
}

function localizedTitleFor(row: MediaRow | undefined, locale: Locale): string | undefined {
  const node = localizedNode(row, locale)
  return clean(node?.title) || clean(row?.[`title_${locale}`]) || clean(row?.title)
}

function localizedCoverFor(row: MediaRow | undefined, locale: Locale): string | undefined {
  const node = localizedNode(row, locale)
  return clean(node?.coverImage) || clean(node?.cover_image) || clean(row?.[`cover_image_${locale}`]) || clean(row?.coverImage) || clean(row?.cover_image)
}

function localizedDescriptionFor(row: MediaRow | undefined, locale: Locale): string | undefined {
  const node = localizedNode(row, locale)
  return clean(node?.description) || clean(row?.[`description_${locale}`]) || clean(row?.description)
}

function strictLocalizedTitleFor(row: MediaRow | undefined, locale: Locale): string | undefined {
  const node = localizedNode(row, locale)
  return clean(node?.title) || clean(row?.[`title_${locale}`]) || (locale === 'en' ? clean(row?.title_en) : clean(row?.title_it))
}

function strictLocalizedCoverFor(row: MediaRow | undefined, locale: Locale): string | undefined {
  const node = localizedNode(row, locale)
  return clean(node?.coverImage) || clean(node?.cover_image) || clean(row?.[`cover_image_${locale}`]) || clean(row?.[`coverImage_${locale}`])
}

function strictLocalizedDescriptionFor(row: MediaRow | undefined, locale: Locale): string | undefined {
  const node = localizedNode(row, locale)
  return clean(node?.description) || clean(row?.[`description_${locale}`]) || (locale === 'en' ? clean(row?.description_en) : clean(row?.description_it))
}

function localeCheckKey(locale: Locale): string {
  return `__geekore_full_locale_checked_${locale}`
}

function markLocaleChecked(row: MediaRow, locale: Locale): MediaRow {
  return { ...row, [localeCheckKey(locale)]: true }
}

function hasLocaleChecked(row: MediaRow | undefined, locale: Locale): boolean {
  return Boolean(row?.[localeCheckKey(locale)])
}

function cachedRowNeedsRefresh(row: MediaRow | undefined, locale: Locale): boolean {
  if (!row) return true
  if (!hasLocaleChecked(row, locale)) return true

  // La card/drawer devono arrivare già pronti. Prima questo check ignorava la
  // descrizione: risultato = card localizzata a metà e drawer costretto a fare
  // fetch al click. Ora una riga è considerata completa solo se titolo, cover
  // e descrizione sono già disponibili nella lingua corrente.
  if (!strictLocalizedTitleFor(row, locale)) return true
  if (!strictLocalizedCoverFor(row, locale)) return true
  if (!strictLocalizedDescriptionFor(row, locale)) return true

  return false
}


const DETAIL_KEYS = [
  'year', 'release_year', 'episodes', 'totalSeasons', 'seasons', 'season_episodes',
  'genres', 'score', 'rating', 'avg_rating', 'playing_time', 'min_players', 'max_players',
  'complexity', 'mechanics', 'designers', 'authors', 'studios', 'directors', 'developers',
  'themes', 'platforms', 'cast', 'watchProviders', 'italianSupportTypes', 'publisher',
  'pages', 'isbn', 'externalUrl', 'source', 'localized',
]

function mergeLocalizedRow<T extends MediaRow>(
  original: T,
  localized: MediaRow | undefined,
  options: Required<MediaLocalizationOptions>,
): T {
  if (!localized) return original

  let next: MediaRow = { ...original }
  for (const key of DETAIL_KEYS) {
    const value = localized[key]
    if (value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')) {
      next[key] = value
    }
  }

  const localizedTitle = clean(localized.title)
  const localizedCover = clean(localized.cover_image) || clean(localized.coverImage)
  const localizedDescription = clean(localized.description)
  const localizedId = clean(localized.external_id) || clean(localized.id)
  const localizedType = clean(localized.type)

  next = setFirstExistingOrFirst(next, options.titleKeys, localizedTitle)
  next = setFirstExistingOrFirst(next, options.coverKeys, localizedCover)
  next = setFirstExistingOrFirst(next, options.descriptionKeys, localizedDescription)

  if (localizedId) next = setFirstExistingOrFirst(next, options.idKeys, localizedId)
  if (localizedType) next = setFirstExistingOrFirst(next, options.typeKeys, localizedType)

  return {
    ...next,
    title: localizedTitle ?? next.title,
    coverImage: clean(localized.coverImage) || localizedCover || next.coverImage,
    cover_image: localizedCover || next.cover_image,
    description: localizedDescription ?? next.description,
    external_id: localizedId ?? next.external_id,
    type: localizedType ?? next.type,
    title_en: localized.title_en ?? next.title_en,
    title_it: localized.title_it ?? next.title_it,
    description_en: localized.description_en ?? next.description_en,
    description_it: localized.description_it ?? next.description_it,
    cover_image_en: localized.cover_image_en ?? next.cover_image_en,
    cover_image_it: localized.cover_image_it ?? next.cover_image_it,
    localized: localized.localized ?? next.localized,
  } as unknown as T
}

function applyCachedRows<T extends MediaRow>(rows: T[], locale: Locale, options: Required<MediaLocalizationOptions>): T[] {
  return rows.map(row => {
    const key = cacheKeyFor(toLocalizationPayload(row, options), locale, options)
    const cached = key ? readCache(key) : undefined
    return cached ? mergeLocalizedRow(row, cached, options) : row
  })
}

export function getCachedLocalizedMediaRow<T extends MediaRow>(
  row: T | null | undefined,
  locale: Locale,
  options?: MediaLocalizationOptions,
): T | null | undefined {
  if (!row) return row
  const opts = mergeOptions(options)
  const payload = toLocalizationPayload(row, opts)
  const key = cacheKeyFor(payload, locale, opts)
  const cached = key ? readCache(key) : undefined
  return cached ? mergeLocalizedRow(row, cached, opts) : row
}

export function hasCachedLocalizedMediaRow(
  row: MediaRow | null | undefined,
  locale: Locale,
  options?: MediaLocalizationOptions,
): boolean {
  if (!row) return false
  const opts = mergeOptions(options)
  const payload = toLocalizationPayload(row, opts)
  const key = cacheKeyFor(payload, locale, opts)
  return Boolean(key && readCache(key))
}

export async function localizeMediaRows<T extends MediaRow>(
  rows: T[],
  locale: Locale,
  options?: MediaLocalizationOptions,
  opts?: { force?: boolean },
): Promise<T[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows

  const mergedOptions = mergeOptions(options)
  const payload = rows.map(row => toLocalizationPayload(row, mergedOptions))
  const keys = payload.map(row => cacheKeyFor(row, locale, mergedOptions))
  const cachedRows = rows.map((row, index) => {
    const cached = keys[index] ? readCache(keys[index] as string) : undefined
    return cached ? mergeLocalizedRow(row, cached, mergedOptions) : row
  })

  const missingIndexes = rows
    .map((_, index) => index)
    .filter(index => {
      const key = keys[index]
      const cached = key ? readCache(key as string) : undefined
      return opts?.force || !key || cachedRowNeedsRefresh(cached, locale)
    })

  if (missingIndexes.length === 0) return cachedRows

  const requestPayload = missingIndexes.map(index => payload[index])
  const requestKey = `${locale}:${JSON.stringify(requestPayload.map(item => [item.external_id || item.id, item.type, item.title]).slice(0, 100))}`

  try {
    const promise = inflight.get(requestKey) || fetch(`/api/media/localize?lang=${encodeURIComponent(locale)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lang': locale,
        'x-geekore-locale': locale,
      },
      body: JSON.stringify({ items: requestPayload, mode: 'full' }),
    }).then(async res => {
      if (!res.ok) return []
      const json = await res.json().catch(() => null)
      return Array.isArray(json?.items) ? json.items : []
    }).finally(() => inflight.delete(requestKey))

    inflight.set(requestKey, promise)
    const localizedItems = await promise
    if (!Array.isArray(localizedItems) || localizedItems.length === 0) return cachedRows

    const nextRows = [...cachedRows]
    localizedItems.forEach((localized, localizedIndex) => {
      const originalIndex = missingIndexes[localizedIndex]
      if (originalIndex == null) return
      const sourceRow = rows[originalIndex]
      const merged = markLocaleChecked(mergeLocalizedRow(sourceRow, localized || payload[originalIndex], mergedOptions), locale)
      nextRows[originalIndex] = merged as unknown as T
      const primaryKey = keys[originalIndex]
      if (primaryKey) writeCache(primaryKey, merged)
      const localizedKey = cacheKeyFor(toLocalizationPayload(merged, mergedOptions), locale, mergedOptions)
      if (localizedKey) writeCache(localizedKey, merged)
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geekore:media-localized', { detail: { locale } }))
    }

    return nextRows
  } catch {
    return cachedRows
  }
}

export async function prewarmLocalizedMediaRows<T extends MediaRow>(
  rows: T[],
  locale: Locale,
  options?: MediaLocalizationOptions,
): Promise<void> {
  await localizeMediaRows(rows, locale, options).catch(() => rows)
}

export async function localizePostMediaPreviews<T extends { media_preview?: MediaRow | null }>(
  posts: T[],
  locale: Locale,
  options?: MediaLocalizationOptions,
): Promise<T[]> {
  if (!Array.isArray(posts) || posts.length === 0) return posts

  const positions: number[] = []
  const previews: MediaRow[] = []

  posts.forEach((post, index) => {
    if (post.media_preview) {
      positions.push(index)
      previews.push(post.media_preview)
    }
  })

  if (previews.length === 0) return posts

  const localizedPreviews = await localizeMediaRows(previews, locale, options || {
    titleKeys: ['title'],
    coverKeys: ['cover_image'],
    idKeys: ['external_id'],
    typeKeys: ['type'],
    descriptionKeys: ['description'],
  })

  const byIndex = new Map<number, MediaRow>()
  positions.forEach((postIndex, previewIndex) => {
    byIndex.set(postIndex, localizedPreviews[previewIndex])
  })

  return posts.map((post, index) => {
    const localizedPreview = byIndex.get(index)
    if (!localizedPreview) return post
    return { ...post, media_preview: localizedPreview } as T
  })
}

export function useLocalizedMediaRows<T extends MediaRow>(
  rows: T[],
  options?: MediaLocalizationOptions,
): T[] {
  const { locale } = useLocale()
  const mergedOptions = useMemo(() => mergeOptions(options), [JSON.stringify(options || {})])
  const [localizedRows, setLocalizedRows] = useState<T[]>(() => applyCachedRows(rows, locale, mergedOptions))
  const rowsKey = useMemo(() => JSON.stringify(rows.map(row => {
    const payload = toLocalizationPayload(row, mergedOptions)
    return [payload.external_id || payload.id, payload.type, payload.title, payload.description, payload.coverImage || payload.cover_image]
  })), [rows, mergedOptions])

  useEffect(() => {
    let cancelled = false
    const cached = applyCachedRows(rows, locale, mergedOptions)
    setLocalizedRows(cached)

    localizeMediaRows(rows, locale, options).then(next => {
      if (!cancelled) setLocalizedRows(next)
    })

    const onLocalized = (event: Event) => {
      const detailLocale = (event as CustomEvent).detail?.locale
      if (detailLocale && detailLocale !== locale) return
      if (!cancelled) setLocalizedRows(applyCachedRows(rows, locale, mergedOptions))
    }

    window.addEventListener('geekore:media-localized', onLocalized)
    return () => {
      cancelled = true
      window.removeEventListener('geekore:media-localized', onLocalized)
    }
  }, [rowsKey, locale]) // eslint-disable-line react-hooks/exhaustive-deps

  return localizedRows
}

export function useLocalizedMediaRow<T extends MediaRow>(
  row: T | null | undefined,
  options?: MediaLocalizationOptions,
): T | null | undefined {
  const rows = useMemo(() => (row ? [row] : []), [row])
  const localized = useLocalizedMediaRows(rows, options)
  if (!row) return row
  return (localized[0] || row) as T
}
