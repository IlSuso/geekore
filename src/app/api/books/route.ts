import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { translateWithCache } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const CACHE_DURATION_MS = 86400000 // 24 ore

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCoverUrl(volume: any): string | null {
  const links = volume?.volumeInfo?.imageLinks
  if (!links) return null

  const raw =
    links.extraLarge ||
    links.large ||
    links.medium ||
    links.thumbnail ||
    links.smallThumbnail

  if (!raw) return null

  return raw
    .replace('zoom=1', 'zoom=3')
    .replace('zoom=5', 'zoom=3')
    .replace('&edge=curl', '')
    .replace('http://', 'https://')
}

function openLibraryCover(isbn: string | null, size: 'L' | 'M' = 'L'): string | null {
  if (!isbn) return null
  return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg`
}

function mapGoogleCategories(categories: string[]): string[] {
  const result = new Set<string>()
  for (const cat of categories) {
    for (const part of cat.split(/\s*[/&]\s*/)) {
      const clean = part.trim()
      if (clean.length > 2) result.add(clean)
    }
  }
  return Array.from(result).slice(0, 5)
}

function parseVolume(item: any): any | null {
  const info = item?.volumeInfo
  if (!info?.title) return null

  const isbn13 = (info.industryIdentifiers || []).find(
    (i: any) => i.type === 'ISBN_13'
  )?.identifier ?? null

  const isbn10 = (info.industryIdentifiers || []).find(
    (i: any) => i.type === 'ISBN_10'
  )?.identifier ?? null

  const isbn = isbn13 || isbn10

  const googleCover = buildCoverUrl(item)
  const olCover = openLibraryCover(isbn)
  const coverImage = googleCover || olCover

  if (!coverImage) return null

  const publishedDate = info.publishedDate as string | undefined
  const year = publishedDate ? parseInt(publishedDate.slice(0, 4)) : undefined
  const fullDate =
    publishedDate?.length === 10
      ? publishedDate
      : year
      ? `${year}-01-01`
      : undefined

  const authors: string[] = info.authors || []
  const publisher: string | undefined = info.publisher || undefined
  const pageCount: number | undefined = info.pageCount || undefined
  const description: string | undefined = info.description
    ? truncateAtSentence(info.description, 500)
    : undefined
  const categories: string[] = mapGoogleCategories(info.categories || [])
  const language: string = info.language || 'en'

  const score: number | undefined =
    info.averageRating && info.ratingsCount && info.ratingsCount >= 10
      ? Math.round(info.averageRating * 10) / 10
      : undefined

  return {
    id: `gbooks-${item.id}`,
    type: 'book',
    source_api: 'google_books',
    title: info.title as string,
    subtitle: info.subtitle as string | undefined,
    description,
    coverImage,
    date: fullDate,
    year,
    genres: categories,
    score,
    authors: authors.length ? authors : undefined,
    studios: publisher ? [publisher] : undefined,
    publisher,
    pageCount,
    isbn,
    original_language: language,
    category: 'book',
    source: 'Google Books',
    url: info.infoLink || `https://books.google.com/books?id=${item.id}`,
  }
}

// ── Endpoint ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'books' })
  if (!rl.ok) {
    return NextResponse.json(
      { results: [], error: 'Troppe richieste. Riprova tra qualche secondo.' },
      { status: 429, headers: rl.headers }
    )
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || searchParams.get('q')
  const lang = searchParams.get('lang') || 'it'
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { results: [], error: 'Google Books API key non configurata' },
      { status: 503, headers: rl.headers }
    )
  }

  // ── MODALITÀ RICERCA ──────────────────────────────────────────────────────
  if (search) {
    if (typeof search !== 'string' || search.trim().length < 2 || search.length > 200) {
      return NextResponse.json({ results: [] }, { status: 400, headers: rl.headers })
    }

    const term = search.trim()

    const queries = [
      `intitle:${encodeURIComponent(term)}`,
      `inauthor:${encodeURIComponent(term)}`,
    ]

    const seen = new Set<string>()
    const allItems: any[] = []

    await Promise.all(
      queries.map(async (q) => {
        try {
          const url =
            `https://www.googleapis.com/books/v1/volumes` +
            `?q=${q}` +
            `&maxResults=15` +
            `&printType=books` +
            `&orderBy=relevance` +
            `&langRestrict=${lang}` +
            `&key=${apiKey}`

          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
          })
          if (!res.ok) return
          const json = await res.json()
          for (const item of json.items || []) {
            if (!seen.has(item.id)) {
              seen.add(item.id)
              allItems.push(item)
            }
          }
        } catch { /* ignora errori singola query */ }
      })
    )

    // Seconda passata senza langRestrict se pochi risultati
    if (allItems.length < 5) {
      try {
        const url =
          `https://www.googleapis.com/books/v1/volumes` +
          `?q=${encodeURIComponent(term)}` +
          `&maxResults=20` +
          `&printType=books` +
          `&orderBy=relevance` +
          `&key=${apiKey}`

        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const json = await res.json()
          for (const item of json.items || []) {
            if (!seen.has(item.id)) {
              seen.add(item.id)
              allItems.push(item)
            }
          }
        }
      } catch { /* ignora */ }
    }

    const rawResults = allItems
      .map(parseVolume)
      .filter(Boolean)
      .slice(0, 20)

    // Ordina per rilevanza titolo
    const q = term.toLowerCase()
    rawResults.sort((a: any, b: any) => {
      const scoreTitle = (t: string) => {
        const tl = t.toLowerCase()
        return tl === q ? 0 : tl.startsWith(q) ? 1 : tl.includes(q) ? 2 : 3
      }
      return scoreTitle(a.title) - scoreTitle(b.title)
    })

    // Traduzione descrizioni (solo se non già nella lingua target)
    if (lang === 'it') {
      const toTranslate = rawResults.filter(
        (r: any) => r.description && r.original_language !== 'it'
      )
      if (toTranslate.length > 0) {
        const items = toTranslate.map((r: any) => ({ id: r.id, text: r.description as string }))
        try {
          const translated = await translateWithCache(items, 'IT', 'EN')
          toTranslate.forEach((r: any) => {
            if (translated[r.id]) r.description = translated[r.id]
          })
        } catch { /* ignora errori traduzione */ }
      }
    }

    return NextResponse.json({ results: rawResults }, { headers: rl.headers })
  }

  // ── MODALITÀ TRENDING (senza parametri di ricerca) ────────────────────────
  const supabaseService = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { data: cache } = await supabaseService
      .from('books_cache')
      .select('*')
      .single()

    const now = Date.now()
    if (cache && now - new Date(cache.updated_at).getTime() < CACHE_DURATION_MS) {
      return NextResponse.json({ articles: cache.data }, { headers: rl.headers })
    }

    const trendingQueries = lang === 'it'
      ? [
          'subject:narrativa&langRestrict=it',
          'subject:thriller&langRestrict=it',
          'subject:fantasy&langRestrict=it',
          'subject:saggistica&langRestrict=it',
        ]
      : [
          'subject:fiction&langRestrict=en',
          'subject:thriller&langRestrict=en',
          'subject:fantasy&langRestrict=en',
          'subject:biography&langRestrict=en',
        ]

    const seen = new Set<string>()
    const allItems: any[] = []

    await Promise.all(
      trendingQueries.map(async (q) => {
        try {
          const url =
            `https://www.googleapis.com/books/v1/volumes` +
            `?q=${q}` +
            `&maxResults=10` +
            `&printType=books` +
            `&orderBy=newest` +
            `&key=${apiKey}`

          const res = await fetch(url, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
          })
          if (!res.ok) return
          const json = await res.json()
          for (const item of json.items || []) {
            if (!seen.has(item.id)) {
              seen.add(item.id)
              allItems.push(item)
            }
          }
        } catch { /* ignora */ }
      })
    )

    const cleanedArticles = allItems
      .map(parseVolume)
      .filter(Boolean)
      .slice(0, 20)

    await supabaseService.from('books_cache').upsert({
      id: 1,
      data: cleanedArticles,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ articles: cleanedArticles }, { headers: rl.headers })
  } catch (e) {
    console.error('[Books] trending error:', e)
    return NextResponse.json({ articles: [] }, { headers: rl.headers })
  }
}
