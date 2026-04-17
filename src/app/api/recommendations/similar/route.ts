// /api/recommendations/similar
// Cerca titoli simili per GENERI + KEYWORDS/TAGS — mai per titolo.
// AniList: genre_in + tag_in
// TMDb: with_genres + with_keywords (lookup ID keyword)
// IGDB: genres.name + themes.name + keywords.name
// Manga: genre_in + tag_in

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const ANILIST_URL = 'https://graphql.anilist.co'

const IGDB_TO_CROSS: Record<string, string[]> = {
  'Role-playing (RPG)':         ['Fantasy', 'Adventure', 'Drama'],
  'Adventure':                  ['Adventure', 'Fantasy'],
  'Action':                     ['Action', 'Adventure'],
  "Hack and slash/Beat 'em up": ['Action'],
  'Strategy':                   ['Strategy', 'Science Fiction'],
  'Real Time Strategy (RTS)':   ['Strategy', 'Science Fiction'],
  'Turn-based strategy (TBS)':  ['Strategy', 'Drama'],
  'Tactical':                   ['Strategy', 'Thriller'],
  'Shooter':                    ['Action', 'Science Fiction', 'Thriller'],
  'Simulation':                 ['Slice of Life', 'Drama'],
  'Horror':                     ['Horror', 'Thriller', 'Mystery'],
  'Thriller':                   ['Thriller', 'Mystery'],
  'Puzzle':                     ['Mystery', 'Psychological'],
  'Platform':                   ['Adventure', 'Comedy'],
  'Visual Novel':               ['Drama', 'Romance', 'Psychological'],
  'Fighting':                   ['Action'],
  'Sport':                      ['Sports'],
  'Racing':                     ['Action'],
  'Indie':                      ['Adventure', 'Drama'],
  'Arcade':                     ['Action', 'Comedy'],
  'Massively Multiplayer Online (MMO)': ['Fantasy', 'Science Fiction'],
}

// Mapping tag/keyword → IGDB theme IDs per query precisa
const TAG_TO_IGDB_THEME: Record<string, number> = {
  'Science Fiction': 18, 'Sci-Fi': 18, 'space': 18, 'alien': 18, 'aliens': 18,
  'Fantasy': 17, 'magic': 17, 'dragon': 17,
  'Horror': 19, 'horror': 19,
  'Thriller': 20, 'thriller': 20,
  'Drama': 31, 'drama': 31,
  'Comedy': 27, 'comedy': 27,
  'Business': 26, 'Romance': 32,
  'Sandbox': 33, 'Educational': 34, 'Kids': 35,
  'Open World': 33, 'survival': 23, 'Survival': 23,
  'Stealth': 24, 'Historical': 22, 'historical': 22,
}

const IGDB_VALID = new Set([
  'Action','Adventure','Role-playing (RPG)','Shooter','Strategy','Simulation',
  'Puzzle','Racing','Sport','Fighting','Platform',"Hack and slash/Beat 'em up",
  'Real Time Strategy (RTS)','Turn-based strategy (TBS)','Tactical','Visual Novel',
  'Massively Multiplayer Online (MMO)','Indie','Arcade',
])

const GENRE_TO_TMDB_MOVIE: Record<string, number> = {
  'Action':28,'Adventure':12,'Animation':16,'Comedy':35,'Crime':80,
  'Drama':18,'Fantasy':14,'Horror':27,'Mystery':9648,'Romance':10749,
  'Science Fiction':878,'Sci-Fi':878,'Thriller':53,'War':10752,
  'History':36,'Psychological':9648,'Sports':10402,
}
const GENRE_TO_TMDB_TV: Record<string, number> = {
  'Action':10759,'Adventure':10759,'Animation':16,'Comedy':35,'Crime':80,
  'Drama':18,'Fantasy':10765,'Horror':9648,'Mystery':9648,'Romance':10749,
  'Science Fiction':10765,'Sci-Fi':10765,'Thriller':80,'Psychological':9648,
}
// Reverse mapping: TMDb genre ID → nome genere cross-media
const TMDB_MOVIE_ID_TO_GENRE: Record<number, string> = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  18:'Drama',14:'Fantasy',27:'Horror',9648:'Mystery',10749:'Romance',
  878:'Science Fiction',53:'Thriller',10752:'War',36:'History',
}
const TMDB_TV_ID_TO_GENRE: Record<number, string> = {
  10759:'Action',16:'Animation',35:'Comedy',80:'Crime',
  18:'Drama',10765:'Science Fiction',27:'Horror',9648:'Mystery',10749:'Romance',53:'Thriller',
}
const ANILIST_VALID = new Set([
  'Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery',
  'Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological',
])

// Meta-keyword TMDb: descrivono formato/origine/medium, NON il tema — escludere da discovery e scoring
const TMDB_META_KW_BLOCKLIST = new Set([
  'based on novel or book','based on novel','based on book','based on true story',
  'based on true events','based on real events','based on comic','based on comic book',
  'based on manga','based on video game','based on tv series','based on play',
  'based on short story','based on anime','based on graphic novel','based on play or musical',
  'independent film','edited from tv series',
  'duringcreditsstinger','aftercreditsstinger','female protagonist','male protagonist',
  'heterosexual','lgbt','lgbtq+',
  'prequel','sequel','spin off','spin-off','remake','reboot','compilation',
  'anime','cartoon','adult animation','stop motion','3d animation','live action','short film',
  'original video animation (ova)','original net animation (ona)',
  'seinen','shounen','josei','shoujo','kodomomuke','manhwa','manhua',
  'action','adventure','drama','comedy','horror','thriller','mystery','fantasy','romance',
  'animation','animated','science fiction','sci-fi','indie','simulator','simulation',
  'puzzle','strategy','open world','sandbox','stealth','survival','historical',
  'role-playing','turn-based','real-time','multiplayer','massively multiplayer',
  'visual novel','platform','racing','fighting','sport','sports','educational','kids',
])

// Lingue di nicchia escluse dai risultati TMDb
const NICHE_LANGS = new Set(['th','vi','id','ar','hi','tl','ms','te','ta','ml','bn','uk','ro','hu','cs','sr','hr','sk','bg','el'])

// BGG: mappa generi cross-media → termini di ricerca BoardGameGeek
const GENRE_TO_BGG_TERMS: Record<string, string> = {
  'Fantasy': 'fantasy', 'Science Fiction': 'science fiction',
  'Sci-Fi': 'science fiction', 'Horror': 'horror', 'Adventure': 'adventure',
  'Mystery': 'mystery', 'Thriller': 'thriller', 'War': 'wargame',
  'History': 'historical', 'Crime': 'crime', 'Comedy': 'humor',
  'Action': 'action', 'Drama': 'storytelling', 'Psychological': 'psychology',
  'Supernatural': 'supernatural',
}

// BGG categorie → generi cross-media
const BGG_CAT_TO_GENRE: Record<string, string> = {
  'Fantasy': 'Fantasy', 'Science Fiction': 'Science Fiction',
  'Horror': 'Horror', 'Adventure': 'Adventure', 'Mystery': 'Mystery',
  'Thriller': 'Thriller', 'Wargame': 'War', 'Historical': 'History',
  'Humor': 'Comedy', 'Deduction': 'Mystery', 'Murder/Mystery': 'Mystery',
  'Medieval': 'Fantasy', 'Zombies': 'Horror', 'Ancient': 'History',
  'Civilization': 'History', 'Exploration': 'Adventure',
  'Space Exploration': 'Science Fiction', 'Political': 'Drama',
}

function parseBggXml(xml: string) {
  const decode = (s: string) =>
    s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
     .replace(/&#10;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

  return [...xml.matchAll(/<item[^>]+id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([, id, body]) => {
    const name = body.match(/<name[^>]+type="primary"[^>]+value="([^"]+)"/)?.[1]
    if (!name) return []
    return [{
      id,
      name: decode(name),
      year:      parseInt(body.match(/<yearpublished[^>]+value="(\d+)"/)?.[1] || '') || undefined,
      thumbnail: body.match(/<thumbnail>([\s\S]*?)<\/thumbnail>/)?.[1]?.trim(),
      description: decode((body.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').replace(/<[^>]*>/g, '').slice(0, 200)),
      categories: [...body.matchAll(/<link type="boardgamecategory"[^>]+value="([^"]+)"/g)].map(m => m[1]),
      mechanics:  [...body.matchAll(/<link type="boardgamemechanic"[^>]+value="([^"]+)"/g)].map(m => m[1]),
      rating:    parseFloat(body.match(/<average[^>]+value="([0-9.]+)"/)?.[1] || '') || undefined,
      usersRated: parseInt(body.match(/<usersrated[^>]+value="(\d+)"/)?.[1] || '') || undefined,
    }]
  })
}

let cachedIgdbToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, secret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedIgdbToken && cachedIgdbToken.expiresAt > now + 60_000) return cachedIgdbToken.token
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    cachedIgdbToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
    return cachedIgdbToken.token
  } catch { return null }
}

function resolveGenres(rawGenres: string[]) {
  const crossSet = new Set<string>()
  const igdbDirect: string[] = []

  for (const g of rawGenres) {
    if (IGDB_VALID.has(g)) {
      igdbDirect.push(g)
      for (const c of (IGDB_TO_CROSS[g] || [])) crossSet.add(c)
    }
    crossSet.add(g)
  }

  const crossGenres = [...crossSet]
  return {
    igdbGenres: igdbDirect,
    crossGenres,
    anilistGenres: crossGenres.filter(g => ANILIST_VALID.has(g)),
    tmdbMovieIds: [...new Set(crossGenres.map(g => GENRE_TO_TMDB_MOVIE[g]).filter(Boolean) as number[])],
    tmdbTvIds:    [...new Set(crossGenres.map(g => GENRE_TO_TMDB_TV[g]).filter(Boolean) as number[])],
  }
}

// Lookup TMDb keyword IDs da stringhe — restituisce array di ID numerici nell'ordine dell'input
async function resolveTmdbKeywordIds(keywords: string[], token: string): Promise<number[]> {
  if (!keywords.length) return []
  const toResolve = keywords.slice(0, 8)
  const slots: (number | null)[] = new Array(toResolve.length).fill(null)
  console.log('[SIMILAR] resolveTmdbKeywordIds: querying', toResolve)
  await Promise.allSettled(toResolve.map(async (kw, i) => {
    try {
      const res = await fetch(
        `${TMDB_BASE}/search/keyword?query=${encodeURIComponent(kw)}&page=1`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }
      )
      if (!res.ok) return
      const json = await res.json()
      const first = json.results?.[0]
      console.log('[SIMILAR]  kw:', JSON.stringify(kw), '→', first ? `id=${first.id} name="${first.name}"` : 'no match')
      if (first?.id) slots[i] = first.id
    } catch (e) { console.log('[SIMILAR]  kw:', JSON.stringify(kw), '→ error:', e) }
  }))
  const ordered = slots.filter((id): id is number => id !== null)
  console.log('[SIMILAR] resolveTmdbKeywordIds result:', ordered)
  return ordered
}

// Quando un titolo non ha keyword/tag, cerca le keyword del titolo più simile che le possiede
async function resolveProxyKeywords(
  sourceType: string, excludeIdNum: number, excludeId: string, tmdbToken: string
): Promise<string[]> {
  // TMDb movie / TV: chiama /similar, poi prende le keyword del primo candidato con keyword
  if ((sourceType === 'movie' || sourceType === 'tv') && !isNaN(excludeIdNum)) {
    try {
      const endpoint = sourceType === 'movie'
        ? `${TMDB_BASE}/movie/${excludeIdNum}/similar?language=it-IT`
        : `${TMDB_BASE}/tv/${excludeIdNum}/similar?language=it-IT`
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const candidates = ((await res.json()).results || []).slice(0, 10)
      for (const candidate of candidates) {
        try {
          const kwUrl = sourceType === 'movie'
            ? `${TMDB_BASE}/movie/${candidate.id}/keywords`
            : `${TMDB_BASE}/tv/${candidate.id}/keywords`
          const kr = await fetch(kwUrl, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(3000) })
          if (!kr.ok) continue
          const kj = await kr.json()
          const kws = ((sourceType === 'movie' ? kj.keywords : kj.results) || [])
            .map((k: any) => k.name as string)
            .filter((k: string) => !TMDB_META_KW_BLOCKLIST.has(k.toLowerCase()))
          if (kws.length >= 2) {
            console.log(`[SIMILAR] proxy kw from "${candidate.title || candidate.name}":`, kws.slice(0, 5))
            return kws.slice(0, 8)
          }
        } catch {}
      }
    } catch {}
  }
  // AniList anime: chiama recommendations, prende i tag del primo con tag
  if (sourceType === 'anime' && excludeId.startsWith('anilist-anime-')) {
    const anilistSourceId = parseInt(excludeId.replace('anilist-anime-', ''), 10)
    if (!isNaN(anilistSourceId)) {
      try {
        const q = `query($id:Int){Media(id:$id,type:ANIME){recommendations(sort:RATING_DESC,perPage:10){nodes{mediaRecommendation{title{romaji}tags{name isGeneralSpoiler}}}}}}`
        const res = await fetch(ANILIST_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, variables: { id: anilistSourceId } }),
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return []
        const json = await res.json()
        for (const node of json.data?.Media?.recommendations?.nodes || []) {
          const m = node?.mediaRecommendation
          if (!m) continue
          const tags = (m.tags || [])
            .filter((t: any) => !t.isGeneralSpoiler)
            .map((t: any) => t.name as string)
            .filter((t: string) => !TMDB_META_KW_BLOCKLIST.has(t.toLowerCase()))
          if (tags.length >= 2) {
            console.log(`[SIMILAR] proxy tags from "${m.title?.romaji}":`, tags.slice(0, 5))
            return tags.slice(0, 10)
          }
        }
      } catch {}
    }
  }
  return []
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'similar' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sourceTitle = searchParams.get('title') || ''
  const rawGenres = (searchParams.get('genres') || '').split(',').map(g => g.trim()).filter(Boolean)
  const rawKeywords = (searchParams.get('keywords') || '').split(',').map(k => k.trim()).filter(Boolean)
  const rawTags = (searchParams.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean)
  const excludeId = searchParams.get('excludeId') || ''
  const sourceType = searchParams.get('type') || ''
  const excludeIdNum = excludeId ? parseInt(excludeId, 10) : NaN

  if (rawGenres.length === 0) return NextResponse.json({ error: 'genres richiesti' }, { status: 400 })

  const tmdbToken = process.env.TMDB_API_KEY || ''
  const igdbClientId = process.env.IGDB_CLIENT_ID || ''
  const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

  const { data: tasteData } = await supabase
    .from('user_taste_profile').select('genre_scores').eq('user_id', user.id).maybeSingle()
  const genreScores: Record<string, number> = (tasteData?.genre_scores as any) || {}
  const maxGenreScore = Math.max(...Object.values(genreScores), 1)

  const { igdbGenres, crossGenres, anilistGenres, tmdbMovieIds, tmdbTvIds } = resolveGenres(rawGenres)

  // Combina keywords + tags; filtra meta-keyword (formato/origine) — solo keyword tematiche
  const allSourceKeywords = [...new Set([...rawKeywords, ...rawTags])]
  const thematicKeywords = allSourceKeywords.filter(kw => !TMDB_META_KW_BLOCKLIST.has(kw.toLowerCase()))

  // Se il titolo non ha keyword tematiche, cerca quelle del titolo più simile che le possiede
  let effectiveKeywords = thematicKeywords
  if (effectiveKeywords.length === 0 && tmdbToken) {
    effectiveKeywords = await resolveProxyKeywords(sourceType, excludeIdNum, excludeId, tmdbToken)
    if (effectiveKeywords.length > 0) {
      console.log('[SIMILAR] proxy keywords attive:', effectiveKeywords)
    }
  }

  // Keyword IDs TMDb — risolti in parallelo con le fetch principali
  const tmdbKeywordIdsPromise = (tmdbToken && effectiveKeywords.length > 0)
    ? resolveTmdbKeywordIds(effectiveKeywords, tmdbToken)
    : Promise.resolve([] as number[])

  const results: any[] = []
  const seenIds = new Set<string>()

  const profileBoost = (recGenres: string[]) =>
    Math.min(25, Math.round(recGenres.reduce((s, g) => s + (genreScores[g] || 0), 0) / maxGenreScore * 25))

  const whyText = (recGenres: string[], matchedKeywords?: string[]) => {
    const shared = recGenres.filter(g => rawGenres.includes(g) || crossGenres.includes(g)).slice(0, 2)
    if (matchedKeywords?.length) return `Temi simili: ${matchedKeywords.slice(0,2).join(', ')}`
    return shared.length > 0 ? `Condivide ${shared.join(', ')} con "${sourceTitle}"` : `Simile a "${sourceTitle}"`
  }

  const add = (item: any) => {
    if (!item.id) return
    if (seenIds.has(item.id)) return
    if (excludeId && item.id === excludeId) return
    seenIds.add(item.id)
    results.push(item)
  }

  // AniList tags sono Title Case — normalizziamo per massimizzare i match
  const toTitleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

  const fetches: Promise<void>[] = []

  // ── IGDB giochi — generi + themes + keywords ───────────────────────────────
  // Mapping generi cross-media → IGDB per casi non coperti (Horror, Sci-Fi, ecc.)
  const CROSS_TO_IGDB_FALLBACK: Record<string, string> = {
    'Horror': 'Adventure', 'Thriller': 'Adventure', 'Science Fiction': 'Shooter',
    'Sci-Fi': 'Shooter', 'Mystery': 'Adventure', 'Psychological': 'Adventure',
    'Slice of Life': 'Simulation', 'Romance': 'Simulation', 'Drama': 'Adventure',
    'Fantasy': 'Role-playing (RPG)', 'Comedy': 'Adventure', 'Sports': 'Sport',
    'Crime': 'Adventure', 'War': 'Shooter', 'History': 'Strategy',
  }
  const igdbQueryGenres = igdbGenres.length > 0
    ? igdbGenres
    : crossGenres.filter(g => IGDB_VALID.has(g)).length > 0
      ? crossGenres.filter(g => IGDB_VALID.has(g))
      : [...new Set(crossGenres.map(g => CROSS_TO_IGDB_FALLBACK[g]).filter(Boolean) as string[])]

  if (igdbClientId && igdbClientSecret) {
    fetches.push((async () => {
      try {
        const token = await getIgdbToken(igdbClientId, igdbClientSecret)
        if (!token) return

        // Offset random per evitare sempre gli stessi top-rated
        const randomOffset = Math.floor(Math.random() * 40)
        const makeIgdbFetch = async (whereClause: string, useOffset = false) => {
          const offset = useOffset ? randomOffset : 0
          const body = `
            fields name,cover.url,first_release_date,genres.name,themes.name,keywords.name,
                   rating,rating_count,involved_companies.company.name,involved_companies.developer,
                   summary;
            where ${whereClause} & rating_count > 20 & rating >= 50 & cover != null;
            sort rating desc; limit 30; offset ${offset};`
          const res = await fetch('https://api.igdb.com/v4/games', {
            method: 'POST',
            headers: { 'Client-ID': igdbClientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
            body, signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) return
          const games = await res.json()
          if (!Array.isArray(games)) return
          for (const g of games) {
            const recGenres: string[] = (g.genres || []).map((x: any) => x.name)
            const developer = (g.involved_companies || [])
              .filter((ic: any) => ic.developer).map((ic: any) => ic.company?.name).filter(Boolean)[0]
            add({
              id: g.id.toString(), title: g.name || '', type: 'game',
              coverImage: g.cover?.url ? `https:${g.cover.url.replace('t_thumb','t_1080p')}` : undefined,
              year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
              genres: recGenres,
              tags: (g.themes || []).map((t: any) => t.name),
              keywords: (g.keywords || []).map((k: any) => k.name),
              score: g.rating ? Math.min(g.rating / 20, 5) : undefined,
              description: g.summary ? g.summary.slice(0, 200) : undefined,
              matchScore: 55 + profileBoost(recGenres),
              why: whyText(recGenres), creatorBoost: developer, _pop: g.rating_count || 0,
            })
          }
        }

        // Query per generi — con offset random per variare i risultati
        if (igdbQueryGenres.length > 0) {
          const genreQ = igdbQueryGenres.slice(0, 2).map(g => `"${g}"`).join(',')
          await makeIgdbFetch(`genres.name = (${genreQ})`, true)
        }

        // Query aggiuntiva per keywords.name (stringhe libere IGDB) + theme IDs
        const igdbKeywords = [...rawKeywords, ...rawTags].slice(0, 8)
        if (igdbKeywords.length > 0) {
          // keywords.name: ricerca per stringa libera (es. "escape", "space travel")
          const kwQ = igdbKeywords.map(k => `"${k}"`).join(',')
          // theme IDs: mappa i tag ai temi IGDB numerici per match preciso
          const themeIds = [...new Set(igdbKeywords
            .map(k => TAG_TO_IGDB_THEME[k] || TAG_TO_IGDB_THEME[k.toLowerCase()])
            .filter(Boolean) as number[]
          )]
          const themeClause = themeIds.length > 0
            ? `themes = (${themeIds.join(',')}) | keywords.name = (${kwQ})`
            : `keywords.name = (${kwQ})`
          await makeIgdbFetch(`(${themeClause})`)
        }
      } catch {}
    })())
  }

  // ── AniList anime — genre_in + tag_in ─────────────────────────────────────
  if (anilistGenres.length > 0 || rawTags.length > 0) {
    fetches.push((async () => {
      try {
        // Query con generi
        if (anilistGenres.length > 0) {
          const q = `query($g:[String]){Page(page:1,perPage:25){media(type:ANIME,genre_in:$g,sort:[SCORE_DESC],isAdult:false){id title{romaji english}coverImage{large}seasonYear genres averageScore popularity episodes description tags{name}}}}`
          const res = await fetch(ANILIST_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, variables: { g: anilistGenres.slice(0, 3) } }),
            signal: AbortSignal.timeout(6000),
          })
          if (res.ok) {
            const json = await res.json()
            for (const m of json.data?.Page?.media || []) {
              const id = `anilist-anime-${m.id}`
              const recGenres: string[] = m.genres || []
              add({ id, title: m.title?.romaji || m.title?.english || '', type: 'anime',
                coverImage: m.coverImage?.large, year: m.seasonYear, genres: recGenres,
                tags: (m.tags || []).map((t: any) => t.name),
                episodes: m.episodes ?? undefined,
                description: m.description ? m.description.replace(/<[^>]*>/g, '').slice(0, 200) : undefined,
                score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
                matchScore: 50 + profileBoost(recGenres), why: whyText(recGenres), _pop: m.popularity || 0 })
            }
          }
        }

        // Query aggiuntiva con tags — usa effectiveKeywords come fallback se rawTags/rawKeywords vuoti
        const anilistTagsSrc = (rawTags.length > 0 || rawKeywords.length > 0)
          ? [...rawTags, ...rawKeywords]
          : effectiveKeywords
        const anilistTags = [...new Set(anilistTagsSrc
          .slice(0, 10)
          .flatMap(t => [t, toTitleCase(t)])
        )]
        if (anilistTags.length > 0) {
          const q = `query($t:[String]){Page(page:1,perPage:20){media(type:ANIME,tag_in:$t,sort:[SCORE_DESC],isAdult:false){id title{romaji english}coverImage{large}seasonYear genres averageScore popularity episodes description tags{name}}}}`
          const res = await fetch(ANILIST_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, variables: { t: anilistTags } }),
            signal: AbortSignal.timeout(6000),
          })
          if (res.ok) {
            const json = await res.json()
            for (const m of json.data?.Page?.media || []) {
              const id = `anilist-anime-${m.id}`
              const recGenres: string[] = m.genres || []
              const allTags = (m.tags || []).map((t: any) => t.name)
              const matchedTags = allTags.filter((t: string) => anilistTags.includes(t))
              add({ id, title: m.title?.romaji || m.title?.english || '', type: 'anime',
                coverImage: m.coverImage?.large, year: m.seasonYear, genres: recGenres,
                tags: allTags,
                episodes: m.episodes ?? undefined,
                description: m.description ? m.description.replace(/<[^>]*>/g, '').slice(0, 200) : undefined,
                score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
                matchScore: 58 + profileBoost(recGenres), why: whyText(recGenres, matchedTags), _pop: m.popularity || 0 })
            }
          }
        }

        // Fallback: se non ci sono tag, usa le raccomandazioni utente di AniList
        if (anilistTags.length === 0 && sourceType === 'anime' && excludeId.startsWith('anilist-anime-')) {
          const anilistSourceId = parseInt(excludeId.replace('anilist-anime-', ''), 10)
          if (!isNaN(anilistSourceId)) {
            const q = `query($id:Int){Media(id:$id,type:ANIME){recommendations(sort:RATING_DESC,perPage:20){nodes{mediaRecommendation{id title{romaji english}coverImage{large}seasonYear genres averageScore popularity episodes description tags{name}}}}}}`
            const res = await fetch(ANILIST_URL, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: q, variables: { id: anilistSourceId } }),
              signal: AbortSignal.timeout(6000),
            })
            if (res.ok) {
              const json = await res.json()
              for (const node of json.data?.Media?.recommendations?.nodes || []) {
                const m = node?.mediaRecommendation
                if (!m) continue
                const id = `anilist-anime-${m.id}`
                const recGenres: string[] = m.genres || []
                add({ id, title: m.title?.romaji || m.title?.english || '', type: 'anime',
                  coverImage: m.coverImage?.large, year: m.seasonYear, genres: recGenres,
                  tags: (m.tags || []).map((t: any) => t.name),
                  episodes: m.episodes ?? undefined,
                  description: m.description ? m.description.replace(/<[^>]*>/g, '').slice(0, 200) : undefined,
                  score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
                  matchScore: 62 + profileBoost(recGenres), why: `Consigliato dalla community per "${sourceTitle}"`,
                  _foundByKeyword: true, _pop: m.popularity || 0 })
              }
            }
          }
        }
      } catch {}
    })())
  }

  // ── TMDb film — generi PRIMA (+ fetch keyword reali), poi keyword discover (OR) ──
  if (tmdbToken && tmdbMovieIds.length > 0) {
    fetches.push((async () => {
      try {
        const tmdbKwIds = await tmdbKeywordIdsPromise
        const movieGenres = (ids: number[]) =>
          [...new Set(ids.map((id: number) => TMDB_MOVIE_ID_TO_GENRE[id]).filter(Boolean) as string[])]

        const filterLang = (arr: any[]) => arr.filter((m: any) => !NICHE_LANGS.has(m.original_language || ''))

        // STEP 1: Genre discover + keyword discover in parallelo
        const genreParams = new URLSearchParams({ with_genres: tmdbMovieIds.slice(0,3).join(','), sort_by: 'vote_average.desc', 'vote_count.gte': '100', language: 'it-IT' })
        const orKwIds = tmdbKwIds.slice(0, 6)
        const kwDiscoverP = orKwIds.length > 0
          ? fetch(`${TMDB_BASE}/discover/movie?${new URLSearchParams({ with_keywords: orKwIds.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': '100', language: 'it-IT' })}`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) })
          : (sourceType === 'movie' && !isNaN(excludeIdNum))
            ? fetch(`${TMDB_BASE}/movie/${excludeIdNum}/similar?language=it-IT`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) })
            : Promise.resolve(null as Response | null)
        const [genreRes, kwRes] = await Promise.all([
          fetch(`${TMDB_BASE}/discover/movie?${genreParams}`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) }),
          kwDiscoverP,
        ])
        const genreItems: any[] = genreRes.ok ? filterLang((await genreRes.json()).results || []).slice(0, 20) : []
        const kwItems: any[] = kwRes?.ok ? filterLang((await kwRes.json()).results || []).slice(0, 20) : []
        console.log('[SIMILAR] tmdbKwIds (movie):', tmdbKwIds)
        console.log('[SIMILAR] TMDb movie kw discover returned:', kwItems.length, 'results (OR:', orKwIds.join('|'), ')')

        const genreIdSet = new Set(genreItems.map((m: any) => m.id))
        const kwIdSet = new Set(kwItems.map((m: any) => m.id))
        const allCandidates = [...genreItems, ...kwItems.filter((m: any) => !genreIdSet.has(m.id))]

        // STEP 2: Fetch keyword reali per tutti i candidati (in parallelo, assorbite da IGDB)
        const movieActualKws = new Map<string, string[]>()
        await Promise.allSettled(allCandidates.slice(0, 30).map(async (m: any) => {
          try {
            const kr = await fetch(`${TMDB_BASE}/movie/${m.id}/keywords`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(2500) })
            if (!kr.ok) return
            const kj = await kr.json()
            const kws = (kj.keywords || []).map((k: any) => k.name.toLowerCase())
            console.log('[SIMILAR] movie', m.id, m.title, '→ kws:', kws.slice(0,5))
            movieActualKws.set(m.id.toString(), kws)
          } catch {}
        }))

        // STEP 3: Aggiungi tutti con keyword reali; _foundByKeyword per quelli nel kw discover
        for (const m of allCandidates) {
          const id = m.id.toString()
          const recGenres = movieGenres(m.genre_ids || [])
          const actualKws = movieActualKws.get(id) || []
          add({ id, title: m.title || '', type: 'movie',
            coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
            year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
            genres: recGenres, keywords: actualKws,
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview ? m.overview.slice(0, 200) : undefined,
            matchScore: 50 + profileBoost(recGenres), why: whyText(recGenres),
            _foundByKeyword: kwIdSet.has(m.id), _pop: m.popularity || 0 })
        }
      } catch {}
    })())
  }

  // ── TMDb serie TV — generi PRIMA (+ fetch keyword reali), poi keyword discover (OR) ──
  if (tmdbToken && tmdbTvIds.length > 0) {
    fetches.push((async () => {
      try {
        const tmdbKwIds = await tmdbKeywordIdsPromise
        const tvGenres = (ids: number[]) =>
          [...new Set(ids.map((id: number) => TMDB_TV_ID_TO_GENRE[id]).filter(Boolean) as string[])]

        const filterLangTv = (arr: any[]) => arr.filter((m: any) => !NICHE_LANGS.has(m.original_language || ''))

        // STEP 1: Genre discover + keyword discover in parallelo
        const genreParamsTv = new URLSearchParams({ with_genres: tmdbTvIds.slice(0,3).join(','), sort_by: 'vote_average.desc', 'vote_count.gte': '50', language: 'it-IT' })
        const orKwIdsTv = tmdbKwIds.slice(0, 6)
        const kwDiscoverTvP = orKwIdsTv.length > 0
          ? fetch(`${TMDB_BASE}/discover/tv?${new URLSearchParams({ with_keywords: orKwIdsTv.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': '50', language: 'it-IT' })}`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) })
          : (sourceType === 'tv' && !isNaN(excludeIdNum))
            ? fetch(`${TMDB_BASE}/tv/${excludeIdNum}/similar?language=it-IT`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) })
            : Promise.resolve(null as Response | null)
        const [genreResTv, kwResTv] = await Promise.all([
          fetch(`${TMDB_BASE}/discover/tv?${genreParamsTv}`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) }),
          kwDiscoverTvP,
        ])
        const genreItemsTv: any[] = genreResTv.ok ? filterLangTv((await genreResTv.json()).results || []).slice(0, 20) : []
        const kwItemsTv: any[] = kwResTv?.ok ? filterLangTv((await kwResTv.json()).results || []).slice(0, 20) : []

        const genreIdSetTv = new Set(genreItemsTv.map((m: any) => m.id))
        const kwIdSetTv = new Set(kwItemsTv.map((m: any) => m.id))
        const allCandidatesTv = [...genreItemsTv, ...kwItemsTv.filter((m: any) => !genreIdSetTv.has(m.id))]

        // STEP 2: Fetch keyword reali per tutti i candidati (TV usa /tv/{id}/keywords → kj.results)
        const tvActualKws = new Map<string, string[]>()
        await Promise.allSettled(allCandidatesTv.slice(0, 30).map(async (m: any) => {
          try {
            const kr = await fetch(`${TMDB_BASE}/tv/${m.id}/keywords`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(2500) })
            if (!kr.ok) return
            const kj = await kr.json()
            const kws = (kj.results || []).map((k: any) => k.name.toLowerCase())
            tvActualKws.set(m.id.toString(), kws)
          } catch {}
        }))

        // STEP 3: Aggiungi tutti con keyword reali; _foundByKeyword per quelli nel kw discover
        for (const m of allCandidatesTv) {
          const id = m.id.toString()
          const recGenres = tvGenres(m.genre_ids || [])
          const actualKws = tvActualKws.get(id) || []
          add({ id, title: m.name || '', type: 'tv',
            coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
            year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined,
            genres: recGenres, keywords: actualKws,
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview ? m.overview.slice(0, 200) : undefined,
            episodes: m.number_of_episodes ?? undefined,
            matchScore: 50 + profileBoost(recGenres), why: whyText(recGenres),
            _foundByKeyword: kwIdSetTv.has(m.id), _pop: m.popularity || 0 })
        }
      } catch {}
    })())
  }

  // ── AniList manga — genre_in + tag_in ────────────────────────────────────
  if (anilistGenres.length > 0 || rawTags.length > 0) {
    fetches.push((async () => {
      try {
        if (anilistGenres.length > 0) {
          const q = `query($g:[String]){Page(page:1,perPage:15){media(type:MANGA,genre_in:$g,sort:[SCORE_DESC]){id title{romaji english}coverImage{large}startDate{year}genres averageScore popularity chapters description tags{name}}}}`
          const res = await fetch(ANILIST_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, variables: { g: anilistGenres.slice(0, 3) } }),
            signal: AbortSignal.timeout(6000),
          })
          if (res.ok) {
            const json = await res.json()
            for (const m of json.data?.Page?.media || []) {
              const id = `anilist-manga-${m.id}`
              const recGenres: string[] = m.genres || []
              add({ id, title: m.title?.romaji || m.title?.english || '', type: 'manga',
                coverImage: m.coverImage?.large, year: m.startDate?.year, genres: recGenres,
                tags: (m.tags || []).map((t: any) => t.name),
                episodes: m.chapters ?? undefined,
                description: m.description ? m.description.replace(/<[^>]*>/g, '').slice(0, 200) : undefined,
                score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
                matchScore: 48 + profileBoost(recGenres), why: whyText(recGenres), _pop: m.popularity || 0 })
            }
          }
        }

        const mangaTagsSrc = (rawTags.length > 0 || rawKeywords.length > 0)
          ? [...rawTags, ...rawKeywords]
          : effectiveKeywords
        const anilistTags = [...new Set(mangaTagsSrc
          .slice(0, 10)
          .flatMap(t => [t, toTitleCase(t)])
        )]
        if (anilistTags.length > 0) {
          const q = `query($t:[String]){Page(page:1,perPage:15){media(type:MANGA,tag_in:$t,sort:[SCORE_DESC]){id title{romaji english}coverImage{large}startDate{year}genres averageScore popularity chapters description tags{name}}}}`
          const res = await fetch(ANILIST_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, variables: { t: anilistTags } }),
            signal: AbortSignal.timeout(6000),
          })
          if (res.ok) {
            const json = await res.json()
            for (const m of json.data?.Page?.media || []) {
              const id = `anilist-manga-${m.id}`
              const recGenres: string[] = m.genres || []
              const mangaTags2 = (m.tags || []).map((t: any) => t.name)
              add({ id, title: m.title?.romaji || m.title?.english || '', type: 'manga',
                coverImage: m.coverImage?.large, year: m.startDate?.year, genres: recGenres,
                tags: mangaTags2,
                episodes: m.chapters ?? undefined,
                description: m.description ? m.description.replace(/<[^>]*>/g, '').slice(0, 200) : undefined,
                score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
                matchScore: 55 + profileBoost(recGenres), why: whyText(recGenres, anilistTags), _pop: m.popularity || 0 })
            }
          }
        }
      } catch {}
    })())
  }

  // ── BGG boardgame — search per genere principale + keyword ─────────────────
  const bggTerms: string[] = []
  for (const g of crossGenres) {
    const t = GENRE_TO_BGG_TERMS[g]
    if (t && !bggTerms.includes(t)) bggTerms.push(t)
  }
  // Aggiunge keyword tematiche effettive come termini aggiuntivi
  for (const kw of effectiveKeywords.slice(0, 2)) {
    const t = kw.toLowerCase()
    if (!bggTerms.includes(t)) bggTerms.push(t)
  }

  if (bggTerms.length > 0) {
    fetches.push((async () => {
      try {
        const bggHeaders: HeadersInit = process.env.BGG_BEARER_TOKEN
          ? { Authorization: `Bearer ${process.env.BGG_BEARER_TOKEN}` } : {}

        // Step 1: cerca per termine di genere più specifico
        const searchRes = await fetch(
          `https://www.boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(bggTerms[0])}&type=boardgame`,
          { headers: bggHeaders, signal: AbortSignal.timeout(8000) }
        )
        if (!searchRes.ok) return
        const searchXml = await searchRes.text()

        const ids = [...searchXml.matchAll(/<item[^>]+id="(\d+)"/g)].map(m => m[1]).slice(0, 25)
        if (ids.length === 0) return

        // Step 2: fetch dettagli + statistiche in batch
        const thingRes = await fetch(
          `https://www.boardgamegeek.com/xmlapi2/thing?id=${ids.join(',')}&stats=1`,
          { headers: bggHeaders, signal: AbortSignal.timeout(10000) }
        )
        if (!thingRes.ok) return
        const games = parseBggXml(await thingRes.text())

        const filtered = games
          .filter(g => (g.usersRated || 0) > 150 && (g.rating || 0) > 6)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 15)

        console.log(`[SIMILAR] BGG "${bggTerms[0]}": ${filtered.length} boardgame`)
        for (const g of filtered) {
          const recGenres = g.categories.map(c => BGG_CAT_TO_GENRE[c]).filter(Boolean) as string[]
          add({
            id: `bgg-${g.id}`, title: g.name, type: 'boardgame',
            coverImage: g.thumbnail ? (g.thumbnail.startsWith('//') ? `https:${g.thumbnail}` : g.thumbnail) : undefined,
            year: g.year, genres: recGenres,
            tags: g.mechanics,
            keywords: g.categories.map(c => c.toLowerCase()),
            score: g.rating ? Math.min(g.rating / 2, 5) : undefined,
            description: g.description || undefined,
            matchScore: 50 + profileBoost(recGenres), why: whyText(recGenres),
            _foundByKeyword: false, _pop: g.usersRated || 0,
          })
        }
      } catch {}
    })())
  }

  await Promise.allSettled(fetches)

  // ── Ranking per similarità reale ─────────────────────────────────────────
  // Keywords = segnale primario (peso alto), generi = segnale secondario (peso basso)
  // Usa effectiveKeywords (che include proxy se rawTags/rawKeywords vuoti), filtra meta-keyword
  const sourceTagsNorm = effectiveKeywords
    .map(s => s.toLowerCase())
    .filter(s => !TMDB_META_KW_BLOCKLIST.has(s))
  const sourceTagsSet = new Set(sourceTagsNorm)
  // crossGenres include alias Sci-Fi↔Science Fiction per match più precisi
  const sourceGenresSet = new Set([...rawGenres, ...crossGenres].map(s => s.toLowerCase()))

  const scored = results.map(item => {
    const itemTags = ((item.tags || []) as string[]).map((s: string) => s.toLowerCase())
    const itemKeywords = ((item.keywords || []) as string[]).map((s: string) => s.toLowerCase())
    const itemGenres = ((item.genres || []) as string[]).map((s: string) => s.toLowerCase())
    const itemTagsAll = [...new Set([...itemTags, ...itemKeywords])]

    // Match esatto keyword/tag — segnale più forte
    const exactMatched = itemTagsAll.filter(t => sourceTagsSet.has(t))
    // Match parziale — solo se la keyword sorgente è lunga almeno 4 char (evita falsi positivi)
    const partialMatched = itemTagsAll.filter(t =>
      !sourceTagsSet.has(t) &&
      sourceTagsNorm.some(s => s.length >= 4 && (t.includes(s) || s.includes(t)))
    )
    const genreMatched = itemGenres.filter(g => sourceGenresSet.has(g))

    const scoreBonus = item.score ? item.score / 5 : 0  // 0–1
    // Bonus per item trovati via keyword discover o TMDb/AniList similar (segnale di pertinenza forte)
    const kwQueryBoost = item._foundByKeyword ? 6 : 0

    // Score interno per ordinamento: keywords >> genres
    const similarity = exactMatched.length * 5 + partialMatched.length * 1 + genreMatched.length * 1 + scoreBonus + kwQueryBoost

    // matchScore per il client: calcolato dai match reali (non hardcoded)
    const kwPts    = Math.min(35, exactMatched.length * 10 + partialMatched.length * 2)
    const genrePts = Math.min(15, genreMatched.length * 4)
    const profPts  = Math.min(10, Math.round(profileBoost(item.genres || []) / 2.5))
    const scorePts = Math.round(scoreBonus * 5)
    const computedMatch = Math.min(97, Math.max(30, 30 + kwPts + genrePts + profPts + scorePts + kwQueryBoost * 2))

    // Testo why aggiornato con i keyword effettivamente matchati
    const matchedKwDisplay = exactMatched.slice(0, 2).map(t =>
      effectiveKeywords.find(k => k.toLowerCase() === t) || t
    )
    const updatedWhy = matchedKwDisplay.length > 0
      ? `Temi simili: ${matchedKwDisplay.join(', ')}`
      : item.why

    return { ...item, matchScore: computedMatch, why: updatedWhy, _similarity: similarity }
  })

  scored.sort((a, b) => {
    if (b._similarity !== a._similarity) return b._similarity - a._similarity
    return b._pop - a._pop
  })

  // ── Diversity: garantisce almeno 3 risultati per ogni tipo media disponibile ──
  const GUARANTEED = 3
  const byType: Record<string, typeof scored> = {}
  for (const item of scored) {
    if (!byType[item.type]) byType[item.type] = []
    byType[item.type].push(item)
  }
  const diverseIds = new Set<string>()
  const diverse: typeof scored = []
  // Prima passata: top GUARANTEED per ogni tipo
  for (const items of Object.values(byType)) {
    for (const item of items.slice(0, GUARANTEED)) {
      diverse.push(item)
      diverseIds.add(item.id)
    }
  }
  // Seconda passata: riempi con i migliori assoluti rimanenti
  for (const item of scored) {
    if (diverse.length >= 30) break
    if (!diverseIds.has(item.id)) { diverse.push(item); diverseIds.add(item.id) }
  }
  diverse.sort((a, b) => {
    if (b._similarity !== a._similarity) return b._similarity - a._similarity
    return b._pop - a._pop
  })

  const top30 = diverse.slice(0, 30)
  const clean = top30.map(({ _pop, _similarity, _foundByKeyword, ...r }) => r)

  return NextResponse.json({ items: clean, total: clean.length }, { headers: rl.headers })
}