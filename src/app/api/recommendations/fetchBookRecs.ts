// ════════════════════════════════════════════════════════════════════════════
// ISTRUZIONI DI INSTALLAZIONE
// ════════════════════════════════════════════════════════════════════════════
//
// Questo file contiene la funzione fetchBookRecs da aggiungere a:
//   src/app/api/recommendations/route.ts
//
// STEP 1 — Incolla la funzione fetchBookRecs nel file route.ts,
//   subito prima della funzione runRecommendations (o prima di export async function GET)
//
// STEP 2 — Nel blocco che chiama tutti i fetcher in parallelo (cerca Promise.all con
//   fetchAnimerecs, fetchMangaRecs, ecc.), aggiungi fetchBookRecs:
//
//   const [animeRecs, mangaRecs, movieRecs, tvRecs, gameRecs, bookRecs] = await Promise.all([
//     fetchAnimeRecs(tasteProfile, ownedIds, userId, supabase),
//     fetchMangaRecs(tasteProfile, ownedIds, userId, supabase),
//     fetchMovieRecs(tasteProfile, ownedIds, lang, supabase),
//     fetchTVRecs(tasteProfile, ownedIds, lang, supabase),
//     fetchGameRecs(tasteProfile, ownedIds, supabase),
//     fetchBookRecs(tasteProfile, ownedIds, lang),   // ← AGGIUNGI QUESTA RIGA
//   ])
//
// STEP 3 — Nel return finale dove vengono assemblati i recommendations, aggiungi:
//
//   if (bookRecs.length > 0) recommendations['book'] = bookRecs
//
// ════════════════════════════════════════════════════════════════════════════

// ── Funzione da incollare in src/app/api/recommendations/route.ts ────────────

// HELPER INTERNI (da mettere subito prima di fetchBookRecs se non già presenti nel file)
// Se buildBookCoverUrl e openLibraryCoverByIsbn sono già definiti nel file sync/route.ts,
// devi ridefinirli qui perché i file sono separati.

function _buildBookCoverUrl(item: any): string | null {
  const links = item?.volumeInfo?.imageLinks
  if (!links) return null
  const raw = links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail
  if (!raw) return null
  return raw.replace('zoom=1', 'zoom=3').replace('zoom=5', 'zoom=3').replace('&edge=curl', '').replace('http://', 'https://')
}

function _openLibraryCover(isbn: string | null): string | null {
  if (!isbn) return null
  return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
}

function _mapBookCats(categories: string[]): string[] {
  const result = new Set<string>()
  for (const cat of categories) {
    for (const part of cat.split(/\s*[/&]\s*/)) {
      const clean = part.trim()
      if (clean.length > 2) result.add(clean)
    }
  }
  return Array.from(result).slice(0, 5)
}

// Mappa generi del profilo utente → query Google Books
// Il profilo usa generi cross-media (Fantasy, Drama, Thriller, ecc.)
// Google Books usa "subject:" per i generi
const GENRE_TO_BOOK_QUERY: Record<string, string[]> = {
  'Fantasy':          ['subject:fantasy', 'subject:fantasy+adventure'],
  'Science Fiction':  ['subject:science+fiction', 'subject:sci-fi'],
  'Horror':           ['subject:horror', 'subject:dark+fiction'],
  'Thriller':         ['subject:thriller', 'subject:suspense'],
  'Mystery':          ['subject:mystery', 'subject:detective'],
  'Romance':          ['subject:romance', 'subject:love+story'],
  'Drama':            ['subject:literary+fiction', 'subject:drama'],
  'Action':           ['subject:action+adventure', 'subject:adventure'],
  'Adventure':        ['subject:adventure', 'subject:action+adventure'],
  'History':          ['subject:historical+fiction', 'subject:history'],
  'Crime':            ['subject:crime+fiction', 'subject:noir'],
  'Comedy':           ['subject:humor', 'subject:comedy'],
  'War':              ['subject:war+fiction', 'subject:military+history'],
  'Political':        ['subject:political+fiction', 'subject:political+thriller'],
  'Psychological':    ['subject:psychological+thriller', 'subject:psychological+fiction'],
  'Supernatural':     ['subject:supernatural', 'subject:paranormal'],
  'Medieval':         ['subject:historical+fiction', 'subject:medieval'],
  'Biography':        ['subject:biography', 'subject:memoir'],
  'Family':           ['subject:family+fiction', 'subject:domestic+fiction'],
}

// Fallback quando il profilo non ha generi riconoscibili
const FALLBACK_BOOK_QUERIES = [
  'subject:bestselling+fiction',
  'subject:literary+fiction',
  'subject:contemporary+fiction',
  'subject:thriller+mystery',
]

async function fetchBookRecs(
  tasteProfile: any,
  ownedIds: Set<string>,
  lang: string
): Promise<any[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  if (!apiKey) return []

  // Estrai i generi top dal profilo (cross-media: anime, film, ecc.)
  const topGenres: string[] = (tasteProfile.globalGenres || [])
    .slice(0, 8)
    .map((g: any) => g.genre as string)

  // Costruisci le query Google Books dai generi del profilo
  const queries = new Set<string>()
  for (const genre of topGenres) {
    const bookQueries = GENRE_TO_BOOK_QUERY[genre]
    if (bookQueries) {
      for (const q of bookQueries.slice(0, 1)) queries.add(q) // 1 query per genere
    }
  }

  // Aggiungi query per autori preferiti (se l'utente ha libri in collezione)
  const topAuthors: string[] = Object.entries(tasteProfile.creatorScores?.authors || {})
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([name]) => `inauthor:${name}`)
  for (const q of topAuthors) queries.add(q)

  // Fallback se troppo poche query
  if (queries.size < 3) {
    for (const q of FALLBACK_BOOK_QUERIES) queries.add(q)
  }

  // Aggiungi query editori italiani se lang=it
  if (lang === 'it') {
    queries.add('inpublisher:Mondadori')
    queries.add('inpublisher:Feltrinelli')
  }

  const seen = new Set<string>()
  const allItems: any[] = []

  await Promise.all(
    Array.from(queries).slice(0, 12).map(async (q) => {
      try {
        const url =
          `https://www.googleapis.com/books/v1/volumes` +
          `?q=${encodeURIComponent(q)}` +
          `&maxResults=10` +
          `&printType=books` +
          `&orderBy=relevance` +
          `&key=${apiKey}`

        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return
        const json = await res.json()
        for (const item of json.items || []) {
          const gbId = `gbooks-${item.id}`
          if (!seen.has(item.id) && !ownedIds.has(gbId)) {
            seen.add(item.id)
            allItems.push(item)
          }
        }
      } catch { /* ignora errori singola query */ }
    })
  )

  const currentYear = new Date().getFullYear()

  // Trasforma in Recommendation
  const recs: any[] = allItems
    .map((item: any) => {
      const info = item?.volumeInfo
      if (!info?.title) return null

      const isbn13 = (info.industryIdentifiers || []).find((i: any) => i.type === 'ISBN_13')?.identifier ?? null
      const isbn10 = (info.industryIdentifiers || []).find((i: any) => i.type === 'ISBN_10')?.identifier ?? null
      const isbn = isbn13 || isbn10

      const coverImage = _buildBookCoverUrl(item) || _openLibraryCover(isbn)
      if (!coverImage) return null

      const genres = _mapBookCats(info.categories || [])
      const year = info.publishedDate ? parseInt(info.publishedDate.slice(0, 4)) : undefined

      // Calcola matchScore rispetto al profilo utente
      // Confronta i generi del libro con i generi top del profilo
      const topGenreScores: Record<string, number> = Object.fromEntries(
        (tasteProfile.globalGenres || []).map((g: any) => [g.genre as string, g.score as number])
      )
      const maxScore = (tasteProfile.globalGenres?.[0]?.score as number) || 1

      let genreScore = 0
      for (const g of genres) {
        const s = topGenreScores[g] || 0
        genreScore += (s / maxScore) * 30
      }

      // Boost se l'autore è nel profilo
      let authorBoost = 0
      const authorScores = tasteProfile.creatorScores?.authors || {}
      for (const author of (info.authors || [])) {
        if (authorScores[author]) {
          authorBoost = 15
          break
        }
      }

      const matchScore = Math.max(10, Math.min(95, Math.round(genreScore + authorBoost)))

      // Spiegazione
      const topGenreName = genres.find((g: string) => topGenreScores[g]) || genres[0]
      const authorName = info.authors?.[0]
      let why = 'Selezionato per te'
      if (authorBoost > 0 && authorName) {
        why = `Perché ami ${authorName}`
      } else if (topGenreName && topGenreScores[topGenreName]) {
        why = `Basato sui tuoi gusti: ${topGenreName}`
      } else if (matchScore >= 70) {
        why = 'Alta compatibilità con i tuoi gusti'
      }

      const isDiscovery = matchScore < 40

      return {
        id: `gbooks-${item.id}`,
        title: info.title as string,
        type: 'book',
        coverImage,
        year,
        genres,
        score: info.averageRating && info.ratingsCount >= 10
          ? Math.round(info.averageRating * 10) / 10
          : undefined,
        description: info.description
          ? info.description.slice(0, 300).replace(/<[^>]+>/g, '') + '...'
          : undefined,
        why,
        matchScore,
        isDiscovery,
        authors: info.authors || [],
        publisher: info.publisher || undefined,
        pageCount: info.pageCount || undefined,
        externalUrl: info.infoLink || `https://books.google.com/books?id=${item.id}`,
      }
    })
    .filter(Boolean)

  // Deduplica per titolo
  const titleSeen = new Set<string>()
  const deduped = recs.filter((r: any) => {
    const key = r.title.toLowerCase().trim()
    if (titleSeen.has(key)) return false
    titleSeen.add(key)
    return true
  })

  // Ordina per matchScore decrescente
  deduped.sort((a: any, b: any) => b.matchScore - a.matchScore)

  return deduped.slice(0, 20)
}

// ════════════════════════════════════════════════════════════════════════════
// ESEMPIO: come appare il blocco Promise.all DOPO l'aggiunta
// (cerca questo pattern nel tuo route.ts e aggiorna di conseguenza)
// ════════════════════════════════════════════════════════════════════════════
//
// PRIMA (esempio — il tuo file potrebbe avere nomi leggermente diversi):
//
//   const [animeRecs, mangaRecs, movieRecs, tvRecs, gameRecs] = await Promise.all([
//     fetchAnimeRecs(tasteProfile, ownedIds, userId, supabase),
//     fetchMangaRecs(tasteProfile, ownedIds, userId, supabase),
//     fetchMovieRecs(tasteProfile, ownedIds, lang, supabase),
//     fetchTVRecs(tasteProfile, ownedIds, lang, supabase),
//     fetchGameRecs(tasteProfile, ownedIds, supabase),
//   ])
//
// DOPO:
//
//   const [animeRecs, mangaRecs, movieRecs, tvRecs, gameRecs, bookRecs] = await Promise.all([
//     fetchAnimeRecs(tasteProfile, ownedIds, userId, supabase),
//     fetchMangaRecs(tasteProfile, ownedIds, userId, supabase),
//     fetchMovieRecs(tasteProfile, ownedIds, lang, supabase),
//     fetchTVRecs(tasteProfile, ownedIds, lang, supabase),
//     fetchGameRecs(tasteProfile, ownedIds, supabase),
//     fetchBookRecs(tasteProfile, ownedIds, lang),
//   ])
//
// E poi nel return/assemblaggio:
//
//   if (bookRecs.length > 0) recommendations['book'] = bookRecs
//
// ════════════════════════════════════════════════════════════════════════════
