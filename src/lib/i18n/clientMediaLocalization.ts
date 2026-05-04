'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, type Locale } from '@/lib/locale'

type AnyRow = Record<string, any>

type Options = {
  titleKeys?: string[]
  coverKeys?: string[]
  idKeys?: string[]
  typeKeys?: string[]
  enabled?: boolean
}

const DEFAULT_TITLE_KEYS = ['title', 'media_title', 'mediaTitle']
const DEFAULT_COVER_KEYS = ['coverImage', 'cover_image', 'media_cover', 'mediaCover']
const DEFAULT_ID_KEYS = ['external_id', 'externalId', 'media_id', 'mediaId', 'tmdb_id', 'tmdbId', 'id', 'appid']
const DEFAULT_TYPE_KEYS = ['type', 'media_type', 'mediaType']

function firstString(row: AnyRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return undefined
}

function shouldTryLocaleAssets(row: AnyRow, options: Required<Pick<Options, 'titleKeys' | 'coverKeys' | 'idKeys' | 'typeKeys'>>) {
  const type = firstString(row, options.typeKeys)
  const id = firstString(row, options.idKeys)
  const title = firstString(row, options.titleKeys)
  return Boolean(type && (id || title))
}

function mergeLocalizedRow<T extends AnyRow>(row: T, localized: AnyRow, options: Required<Pick<Options, 'titleKeys' | 'coverKeys' | 'idKeys' | 'typeKeys'>>): T {
  const next: AnyRow = { ...row }
  const title = localized.title
  const cover = localized.coverImage || localized.cover_image

  if (typeof title === 'string' && title.trim()) {
    for (const key of options.titleKeys) {
      if (key in next || key === options.titleKeys[0]) next[key] = title
    }
  }

  if (typeof cover === 'string' && cover.trim()) {
    for (const key of options.coverKeys) {
      if (key in next || key === options.coverKeys[0]) next[key] = cover
    }
  }

  // Se /api/media/localize corregge un external_id TMDb incoerente, propaghiamo la correzione
  // almeno nello stato client così link, key e ulteriori localizzazioni usano l'ID giusto.
  if (localized.external_id) next.external_id = localized.external_id
  if (localized.externalId) next.externalId = localized.externalId
  if (localized.tmdb_id) next.tmdb_id = localized.tmdb_id
  if (localized.tmdbId) next.tmdbId = localized.tmdbId

  if (localized.title_en) next.title_en = localized.title_en
  if (localized.title_it) next.title_it = localized.title_it
  if (localized.description_en) next.description_en = localized.description_en
  if (localized.description_it) next.description_it = localized.description_it
  if (localized.cover_image_en) next.cover_image_en = localized.cover_image_en
  if (localized.cover_image_it) next.cover_image_it = localized.cover_image_it
  if (localized.localized) next.localized = localized.localized

  return next as T
}

export function useLocalizedMediaRows<T extends AnyRow>(rows: T[], opts?: Options): T[] {
  const { locale } = useLocale()
  const titleKeysSig = (opts?.titleKeys || DEFAULT_TITLE_KEYS).join('|')
  const coverKeysSig = (opts?.coverKeys || DEFAULT_COVER_KEYS).join('|')
  const idKeysSig = (opts?.idKeys || DEFAULT_ID_KEYS).join('|')
  const typeKeysSig = (opts?.typeKeys || DEFAULT_TYPE_KEYS).join('|')

  const options = useMemo(() => ({
    titleKeys: titleKeysSig.split('|').filter(Boolean),
    coverKeys: coverKeysSig.split('|').filter(Boolean),
    idKeys: idKeysSig.split('|').filter(Boolean),
    typeKeys: typeKeysSig.split('|').filter(Boolean),
  }), [titleKeysSig, coverKeysSig, idKeysSig, typeKeysSig])

  const enabled = opts?.enabled !== false
  const [localizedRows, setLocalizedRows] = useState<T[]>(rows)

  const signature = useMemo(() => rows.map((row, index) => [
    index,
    firstString(row, options.idKeys),
    firstString(row, options.typeKeys),
    firstString(row, options.titleKeys),
    firstString(row, options.coverKeys),
  ].join(':')).join('|'), [rows, options])

  useEffect(() => {
    let cancelled = false
    setLocalizedRows(rows)

    if (!enabled || rows.length === 0) return () => { cancelled = true }

    const candidates = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => shouldTryLocaleAssets(row, options))

    if (candidates.length === 0) return () => { cancelled = true }

    const payload = candidates.map(({ row, index }) => ({
      __localizeKey: String(index),
      id: firstString(row, options.idKeys),
      external_id: firstString(row, options.idKeys),
      externalId: row.externalId,
      title: firstString(row, options.titleKeys),
      media_title: row.media_title,
      mediaTitle: row.mediaTitle,
      type: firstString(row, options.typeKeys),
      coverImage: firstString(row, options.coverKeys),
      cover_image: firstString(row, options.coverKeys),
      title_en: row.title_en,
      title_it: row.title_it,
      title_original: row.title_original,
      description: row.description,
      description_en: row.description_en,
      description_it: row.description_it,
      cover_image_en: row.cover_image_en,
      cover_image_it: row.cover_image_it,
      localized: row.localized,
      source: row.source,
      appid: row.appid,
      tmdb_id: row.tmdb_id,
      tmdbId: row.tmdbId,
    }))

    fetch(`/api/media/localize?lang=${locale}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-lang': locale,
        'x-geekore-locale': locale,
      },
      body: JSON.stringify({ items: payload }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (cancelled || !Array.isArray(json?.items)) return
        const byIndex = new Map<number, AnyRow>()
        json.items.forEach((item: AnyRow) => {
          const key = Number(item.__localizeKey)
          if (Number.isFinite(key)) byIndex.set(key, item)
        })

        setLocalizedRows(rows.map((row, index) => {
          const localized = byIndex.get(index)
          return localized ? mergeLocalizedRow(row, localized, options) : row
        }))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [signature, locale, enabled, options, rows])

  return localizedRows
}

export function useLocalizedMediaRow<T extends AnyRow>(row: T | null | undefined, opts?: Options): T | null | undefined {
  const rows = useMemo(() => row ? [row] : [], [row])
  const localized = useLocalizedMediaRows(rows, opts)
  return row ? (localized[0] || row) : row
}

export function getLocalizedMediaHref(row: AnyRow, typeKeys = DEFAULT_TYPE_KEYS, titleKeys = DEFAULT_TITLE_KEYS) {
  const type = firstString(row, typeKeys) || 'all'
  const id = firstString(row, DEFAULT_ID_KEYS)
  const title = firstString(row, titleKeys) || ''
  const query = id || title
  return `/discover?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`
}
