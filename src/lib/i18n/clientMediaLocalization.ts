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

function mergeLocalizedRow<T extends MediaRow>(
  original: T,
  localized: MediaRow | undefined,
  options: Required<MediaLocalizationOptions>,
): T {
  if (!localized) return original

  let next: MediaRow = { ...original }

  const localizedTitle = clean(localized.title)
  const localizedCover = clean(localized.cover_image) || clean(localized.coverImage)
  const localizedDescription = clean(localized.description)
  const localizedId = clean(localized.external_id) || clean(localized.id)
  const localizedType = clean(localized.type)

  next = setFirstExistingOrFirst(next, options.titleKeys, localizedTitle)
  next = setFirstExistingOrFirst(next, options.coverKeys, localizedCover)
  next = setFirstExistingOrFirst(next, options.descriptionKeys, localizedDescription)

  if (localizedId) {
    next = setFirstExistingOrFirst(next, options.idKeys, localizedId)
  }
  if (localizedType) {
    next = setFirstExistingOrFirst(next, options.typeKeys, localizedType)
  }

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
  } as T
}

export async function localizeMediaRows<T extends MediaRow>(
  rows: T[],
  locale: Locale,
  options?: MediaLocalizationOptions,
): Promise<T[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows

  const opts = mergeOptions(options)
  const payload = rows.map(row => toLocalizationPayload(row, opts))

  try {
    const res = await fetch(`/api/media/localize?lang=${encodeURIComponent(locale)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lang': locale,
        'x-geekore-locale': locale,
      },
      body: JSON.stringify({ items: payload }),
    })

    if (!res.ok) return rows

    const json = await res.json().catch(() => null)
    const localizedItems = Array.isArray(json?.items) ? json.items : null
    if (!localizedItems) return rows

    // Mapping per indice: non rompe duplicati, titoli uguali o external_id corretti dal server.
    return rows.map((row, index) => mergeLocalizedRow(row, localizedItems[index] || payload[index], opts))
  } catch {
    return rows
  }
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
  const [localizedRows, setLocalizedRows] = useState<T[]>(rows)
  const optionsKey = useMemo(() => JSON.stringify(options || {}), [options])

  useEffect(() => {
    let cancelled = false
    setLocalizedRows(rows)

    localizeMediaRows(rows, locale, options).then(next => {
      if (!cancelled) setLocalizedRows(next)
    })

    return () => {
      cancelled = true
    }
    // optionsKey stabilizza le dipendenze quando l'oggetto opzioni è inline.
  }, [rows, locale, optionsKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
