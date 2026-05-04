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

function tmdbId(item: MediaLike): string | null {
  const raw = String(item.external_id || item.id || '')
  if (!raw) return null
  if (/^\d+$/.test(raw)) return raw

  const match = raw.match(/tmdb-(?:movie|tv|anime)-(\d+)/)
  return match?.[1] || null
}

function isTmdbTitleType(item: MediaLike): boolean {
  return item.type === 'movie' || item.type === 'tv'
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

async function fetchOfficialTmdbLocaleAssets(item: MediaLike, locale: Locale): Promise<{ title?: string; coverImage?: string }> {
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
      title: clean(details?.title || details?.name),
      coverImage: pickPoster(images?.posters || [], locale),
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
    return clean(item.localized?.it?.title) || clean(item.title_it) || clean(item.title) || clean(item.title_en) || clean(item.title_original)
  }

  return clean(item.localized?.en?.title) || clean(item.title_en) || clean(item.title_original) || clean(item.title) || clean(item.title_it)
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
  const source = item.source || item.type || 'media'
  const id = item.external_id || item.id || item.appid || item.title || 'unknown'
  return `${source}:${id}:description:${sourceLocale}->${targetLocale}`
}

export async function POST(request: NextRequest) {
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const locale = await getRequestLocale(request)
  const items = Array.isArray(body?.items) ? body.items.slice(0, 100) : []
  if (items.length === 0) return NextResponse.json({ items: [] })

  const out = items.map((item: MediaLike) => ({ ...item }))

  // Anche qui forziamo sempre titolo ufficiale TMDb per movie/tv.
  // I vecchi backfill possono avere title_en = titolo italiano.
  const tmdbTitleItems = out
    .filter((item: MediaLike) => isTmdbTitleType(item))
    .filter((item: MediaLike) => Boolean(tmdbId(item)))
    .slice(0, 80)

  if (tmdbTitleItems.length > 0) {
    const results = await Promise.allSettled(
      tmdbTitleItems.map(async (item: MediaLike) => ({ item, ...(await fetchOfficialTmdbLocaleAssets(item, locale)) })),
    )

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const title = clean(result.value.title)
      const coverImage = clean(result.value.coverImage)
      if (!title && !coverImage) continue

      const item = result.value.item
      if (title) {
        item[`title_${locale}`] = title
        item.title = title
      }
      if (coverImage) {
        item[`cover_image_${locale}`] = coverImage
        item.coverImage = coverImage
        item.cover_image = coverImage
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
        },
      }
    }
  }

  const localized = out.map((item: MediaLike) => ({
    ...item,
    title: titleFor(item, locale) || item.title,
    coverImage: clean(item.localized?.[locale]?.coverImage) || clean(item[`cover_image_${locale}`]) || clean(item.coverImage) || clean(item.cover_image),
    cover_image: clean(item.localized?.[locale]?.coverImage) || clean(item[`cover_image_${locale}`]) || clean(item.cover_image) || clean(item.coverImage),
    description: descriptionFor(item, locale) || clean(item.description) || item.description,
  }))

  return NextResponse.json({ items: localized })
}
