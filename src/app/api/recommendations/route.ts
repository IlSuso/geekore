import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// ── Tipi ────────────────────────────────────────────────────────────────────

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game'

interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  genreToTitles: Record<string, Array<{ title: string; type: string; recency: number }>>
  collectionSize: Record<string, number>
  recentWindow: number
  deepSignals: {
    keywords: Record<string, number>
    themes: Record<string, number>
    tones: Record<string, number>
    settings: Record<string, number>
  }
}

interface Recommendation {
  id: string
  title: string
  type: MediaType
  coverImage?: string
  year?: number
  genres: string[]
  score?: number
  description?: string
  why: string
}

// ── TMDb genre maps ──────────────────────────────────────────────────────────
const TMDB_GENRE_MAP: Record<string, number> = {
  'Action': 28, 'Adventure': 12, 'Animation': 16, 'Comedy': 35, 'Crime': 80,
  'Documentary': 99, 'Drama': 18, 'Family': 10751, 'Fantasy': 14, 'History': 36,
  'Horror': 27, 'Music': 10402, 'Mystery': 9648, 'Romance': 10749,
  'Science Fiction': 878, 'Thriller': 53, 'War': 10752, 'Western': 37,
  'Azione': 28, 'Avventura': 12, 'Animazione': 16, 'Commedia': 35, 'Crimine': 80,
  'Documentario': 99, 'Dramma': 18, 'Fantasia': 14, 'Storia': 36, 'Orrore': 27,
  'Musica': 10402, 'Mistero': 9648, 'Romantico': 10749, 'Fantascienza': 878,
  'Guerra': 10752,
}

const TMDB_TV_GENRE_MAP: Record<string, number> = {
  ...TMDB_GENRE_MAP,
  'Action & Adventure': 10759, 'Kids': 10762, 'News': 10763, 'Reality': 10764,
  'Sci-Fi & Fantasy': 10765, 'Soap': 10766, 'Talk': 10767, 'War & Politics': 10768,
}

const IGDB_TO_CROSS_GENRE: Record<string, string[]> = {
  'Role-playing (RPG)': ['Fantasy', 'Adventure', 'Drama'],
  'Action': ['Action', 'Adventure'],
  'Adventure': ['Adventure', 'Fantasy'],
  'Shooter': ['Action', 'Thriller', 'Science Fiction'],
  "Hack and slash/Beat 'em up": ['Action'],
  'Strategy': ['Strategy'],
  'Simulation': ['Simulation'],
  'Horror': ['Horror', 'Thriller', 'Mystery'],
  'Puzzle': ['Mystery', 'Drama'],
  'Platform': ['Adventure', 'Comedy'],
  'Stealth': ['Thriller', 'Action', 'Crime'],
  'Fighting': ['Action'],
  'Sport': ['Sports'],
  'Racing': ['Sports'],
  'Arcade': ['Action'],
  'Music': ['Music'],
  'Indie': ['Drama', 'Adventure'],
  'Visual Novel': ['Drama', 'Romance', 'Mystery'],
  'Turn-based strategy (TBS)': ['Strategy'],
  'Real Time Strategy (RTS)': ['Strategy'],
  'Tactical': ['Strategy', 'Thriller'],
  'Survival': ['Horror', 'Thriller', 'Adventure'],
  'Battle Royale': ['Action', 'Thriller'],
  'Massively Multiplayer Online (MMO)': ['Fantasy', 'Adventure'],
  'Card & Board Game': ['Strategy'],
}

const KEYWORD_TO_DEEP: Record<string, { themes?: string[]; tones?: string[]; settings?: string[] }> = {
  'time travel': { themes: ['time travel'], tones: ['mind-bending'] },
  'revenge': { themes: ['revenge'] },
  'redemption': { themes: ['redemption'] },
  'dystopia': { themes: ['dystopia'], tones: ['dark'], settings: ['dystopian future'] },
  'apocalypse': { themes: ['apocalypse'], tones: ['dark', 'tense'] },
  'superhero': { themes: ['superhero'], tones: ['action-packed'] },
  'artificial intelligence': { themes: ['AI', 'technology'], settings: ['sci-fi future'] },
  'serial killer': { themes: ['crime', 'psychology'], tones: ['dark', 'tense'] },
  'heist': { themes: ['heist', 'crime'], tones: ['tense'] },
  'coming of age': { themes: ['coming of age'], tones: ['emotional'] },
  'magic': { themes: ['magic'], settings: ['fantasy world'] },
  'war': { themes: ['war'], tones: ['dark', 'intense'] },
  'space': { themes: ['space exploration'], settings: ['outer space'] },
  'medieval': { settings: ['medieval'] },
  'post-apocalyptic': { themes: ['survival'], tones: ['dark'], settings: ['post-apocalyptic'] },
  'open world': { themes: ['exploration'], settings: ['open world'] },
  'political': { themes: ['politics'], tones: ['complex'] },
  'philosophical': { tones: ['philosophical'] },
  'friendship': { themes: ['friendship'] },
  'romance': { themes: ['romance'] },
  'psychological': { tones: ['psychological', 'dark'] },
  'supernatural': { themes: ['supernatural'] },
  'mystery': { themes: ['mystery'], tones: ['tense'] },
  'samurai': { settings: ['feudal japan'] },
  'cyberpunk': { themes: ['technology', 'dystopia'], settings: ['cyberpunk'] },
  'vampire': { themes: ['supernatural'], settings: ['gothic'] },
  'zombie': { themes: ['survival', 'apocalypse'], tones: ['horror'] },
  'alien': { themes: ['alien contact'], settings: ['outer space', 'sci-fi future'] },
  'detective': { themes: ['investigation'], tones: ['tense'] },
  'mafia': { themes: ['crime', 'mafia'], tones: ['dark'] },
  'survival': { themes: ['survival'], tones: ['tense'] },
  'monsters': { themes: ['monsters'], settings: ['fantasy world'] },
}

function inferGenresFromName(name: string): string[] {
  const n = name.toLowerCase()
  if (n.includes('horror') || n.includes('dead') || n.includes('evil') || n.includes('resident') || n.includes('silent')) return ['Horror', 'Thriller']
  if (n.includes('war') || n.includes('call of duty') || n.includes('battlefield') || n.includes('medal')) return ['Action', 'Shooter']
  if (n.includes('assassin') || n.includes('hitman') || n.includes('thief')) return ['Action', 'Stealth', 'Adventure']
  if (n.includes('witcher') || n.includes('elder scrolls') || n.includes('dragon age') || n.includes('baldur')) return ['Role-playing (RPG)', 'Fantasy', 'Adventure']
  if (n.includes('dark souls') || n.includes('elden ring') || n.includes('sekiro') || n.includes('bloodborne')) return ['Action', 'Role-playing (RPG)', 'Fantasy']
  if (n.includes('fifa') || n.includes('nba') || n.includes('pes') || n.includes('madden')) return ['Sport']
  if (n.includes('grand theft') || n.includes('gta') || n.includes('mafia')) return ['Action', 'Crime', 'Adventure']
  if (n.includes('civilization') || n.includes('total war') || n.includes('xcom')) return ['Strategy']
  if (n.includes('portal') || n.includes('puzzle')) return ['Puzzle', 'Adventure']
  if (n.includes('minecraft') || n.includes('terraria') || n.includes('subnautica')) return ['Adventure', 'Survival', 'Simulation']
  if (n.includes('racing') || n.includes('forza') || n.includes('need for speed') || n.includes('grid')) return ['Racing', 'Sport']
  if (n.includes('mass effect') || n.includes('cyberpunk') || n.includes('deus ex')) return ['Role-playing (RPG)', 'Science Fiction', 'Action']
  if (n.includes('halo') || n.includes('doom') || n.includes('quake') || n.includes('borderlands')) return ['Shooter', 'Action', 'Science Fiction']
  if (n.includes('final fantasy') || n.includes('persona') || n.includes('tales of')) return ['Role-playing (RPG)', 'Fantasy', 'Drama']
  return []
}

function getTemporalMultiplier(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0.5
  const now = Date.now()
  const updated = new Date(updatedAt).getTime()
  const daysAgo = (now - updated) / (1000 * 60 * 60 * 24)
  if (daysAgo <= 60)  return 3.0
  if (daysAgo <= 120) return 1.8
  if (daysAgo <= 180) return 1.0
  if (daysAgo <= 365) return 0.6
  return 0.3
}

function determineActiveWindow(entries: any[]): number {
  const now = Date.now()
  const count2m = entries.filter(e => {
    if (!e.updated_at) return false
    return (now - new Date(e.updated_at).getTime()) / (1000 * 60 * 60 * 24) <= 60
  }).length
  if (count2m >= 3) return 2
  const count4m = entries.filter(e => {
    if (!e.updated_at) return false
    return (now - new Date(e.updated_at).getTime()) / (1000 * 60 * 60 * 24) <= 120
  }).length
  if (count4m >= 3) return 4
  const count6m = entries.filter(e => {
    if (!e.updated_at) return false
    return (now - new Date(e.updated_at).getTime()) / (1000 * 60 * 60 * 24) <= 180
  }).length
  if (count6m >= 3) return 6
  return 12
}

function isRelevantEntry(entry: any): boolean {
  const rating: number = entry.rating || 0
  const hoursOrEp: number = entry.current_episode || 0
  const type: string = entry.type || ''
  if (rating >= 3.5) return true
  if (type === 'game' || entry.is_steam) return hoursOrEp >= 1
  if (type === 'anime' || type === 'tv') return hoursOrEp >= 2
  if (type === 'manga') return hoursOrEp >= 3
  if (type === 'movie') return hoursOrEp >= 1
  return false
}

function computeTasteProfile(entries: any[], preferences: any): TasteProfile {
  const globalScores: Record<string, number> = {}
  const perTypeScores: Record<string, Record<string, number>> = {
    anime: {}, manga: {}, movie: {}, tv: {}, game: {},
  }
  const genreToTitles: Record<string, Array<{ title: string; type: string; recency: number }>> = {}
  const deepKeywords: Record<string, number> = {}
  const deepThemes: Record<string, number> = {}
  const deepTones: Record<string, number> = {}
  const deepSettings: Record<string, number> = {}

  const relevantEntries = entries.filter(isRelevantEntry)
  const activeWindow = determineActiveWindow(relevantEntries)

  const addScore = (genre: string, weight: number, type: string, title: string, recency: number) => {
    globalScores[genre] = (globalScores[genre] || 0) + weight
    if (perTypeScores[type]) perTypeScores[type][genre] = (perTypeScores[type][genre] || 0) + weight
    if (!genreToTitles[genre]) genreToTitles[genre] = []
    const existing = genreToTitles[genre].find(t => t.title === title)
    if (existing) { if (recency > existing.recency) existing.recency = recency }
    else genreToTitles[genre].push({ title, type, recency })
  }

  const addDeep = (signals: { themes?: string[]; tones?: string[]; settings?: string[] }, weight: number) => {
    for (const kw of signals.themes || []) deepThemes[kw] = (deepThemes[kw] || 0) + weight
    for (const kw of signals.tones || []) deepTones[kw] = (deepTones[kw] || 0) + weight
    for (const kw of signals.settings || []) deepSettings[kw] = (deepSettings[kw] || 0) + weight
  }

  for (const entry of relevantEntries) {
    const title: string = entry.title || ''
    const type: string = entry.type || 'game'
    const rating: number = entry.rating || 0
    const hoursOrEp: number = entry.current_episode || 0
    let genres: string[] = entry.genres || []
    const tags: string[] = entry.tags || []
    const keywords: string[] = entry.keywords || []
    const themes: string[] = entry.themes || []
    const playerPerspectives: string[] = entry.player_perspectives || []

    if (genres.length === 0 && (entry.is_steam || type === 'game')) genres = inferGenresFromName(title)
    if (genres.length === 0) continue

    const temporalMult = getTemporalMultiplier(entry.updated_at)
    const recency = temporalMult / 3.0

    let baseWeight: number
    if (entry.is_steam || type === 'game') {
      const hours = hoursOrEp
      baseWeight = hours === 0 ? 0.5 : Math.min(Math.log10(hours + 1) * 10, 25)
      if (rating >= 4) baseWeight *= 1.5
      else if (rating >= 3.5) baseWeight *= 1.2
    } else {
      const ratingW = rating >= 1 ? rating * 3 : 2
      const engW = Math.min(hoursOrEp / 5, 5)
      baseWeight = ratingW + engW
    }

    const weight = baseWeight * temporalMult

    for (const genre of genres) addScore(genre, weight, type, title, recency)

    if (type === 'game') {
      for (const genre of genres) {
        const crossGenres = IGDB_TO_CROSS_GENRE[genre] || []
        for (const cg of crossGenres) {
          if (!genres.includes(cg)) addScore(cg, weight * 0.4, type, title, recency)
        }
      }
    }

    for (const tag of tags) {
      const tagLower = tag.toLowerCase()
      deepKeywords[tagLower] = (deepKeywords[tagLower] || 0) + weight * 0.5
      const mapped = KEYWORD_TO_DEEP[tagLower]
      if (mapped) addDeep(mapped, weight * 0.5)
    }

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      deepKeywords[kwLower] = (deepKeywords[kwLower] || 0) + weight * 0.5
      const mapped = KEYWORD_TO_DEEP[kwLower]
      if (mapped) addDeep(mapped, weight * 0.5)
    }

    for (const theme of themes) {
      const themeLower = theme.toLowerCase()
      deepThemes[themeLower] = (deepThemes[themeLower] || 0) + weight * 0.6
    }

    for (const pp of playerPerspectives) {
      deepSettings[pp.toLowerCase()] = (deepSettings[pp.toLowerCase()] || 0) + weight * 0.3
    }
  }

  if (preferences) {
    const allFavGenres = [
      ...(preferences.fav_game_genres || []),
      ...(preferences.fav_anime_genres || []),
      ...(preferences.fav_movie_genres || []),
      ...(preferences.fav_tv_genres || []),
      ...(preferences.fav_manga_genres || []),
    ]
    for (const genre of allFavGenres) {
      if (globalScores[genre]) globalScores[genre] *= 2
      else globalScores[genre] = 15
    }
    const disliked: string[] = preferences.disliked_genres || []
    for (const genre of disliked) {
      delete globalScores[genre]
      for (const t of Object.keys(perTypeScores)) delete perTypeScores[t][genre]
      delete genreToTitles[genre]
    }
  }

  const globalGenres = Object.entries(globalScores)
    .sort(([, a], [, b]) => b - a).slice(0, 10)
    .map(([genre, score]) => ({ genre, score }))

  const topGenres = {} as TasteProfile['topGenres']
  for (const [type, scores] of Object.entries(perTypeScores)) {
    topGenres[type as MediaType] = Object.entries(scores)
      .sort(([, a], [, b]) => b - a).slice(0, 6)
      .map(([genre, score]) => ({ genre, score }))
  }

  const collectionSize: Record<string, number> = {}
  for (const entry of entries) {
    collectionSize[entry.type] = (collectionSize[entry.type] || 0) + 1
  }

  return {
    globalGenres, topGenres, genreToTitles, collectionSize,
    recentWindow: activeWindow,
    deepSignals: { keywords: deepKeywords, themes: deepThemes, tones: deepTones, settings: deepSettings },
  }
}

function buildWhy(recGenres: string[], recId: string, tasteProfile: TasteProfile): string {
  const candidates: Array<{ title: string; type: string; score: number; recency: number }> = []

  for (const genre of recGenres) {
    const titles = tasteProfile.genreToTitles[genre] || []
    const genreScore = tasteProfile.globalGenres.find(g => g.genre === genre)?.score || 1
    for (const t of titles) {
      const existing = candidates.find(c => c.title === t.title)
      if (existing) existing.score += genreScore
      else candidates.push({ title: t.title, type: t.type, score: genreScore, recency: t.recency })
    }
  }

  if (candidates.length === 0) {
    const topMatch = tasteProfile.globalGenres.find(g => recGenres.includes(g.genre))
    if (topMatch) return `Basato sui tuoi gusti: ${topMatch.genre}`
    if (recGenres.length > 0) return `Popolare nel genere ${recGenres[0]}`
    return 'Consigliato per te'
  }

  candidates.sort((a, b) => (b.score * (1 + b.recency)) - (a.score * (1 + a.recency)))
  const topCandidates = candidates.slice(0, 5)
  const idSum = recId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const chosen = topCandidates[idSum % topCandidates.length]

  const TYPE_LABEL: Record<string, string> = {
    anime: 'anime', manga: 'manga', movie: 'film', tv: 'serie', game: 'gioco',
  }
  const label = TYPE_LABEL[chosen.type] || chosen.type

  if (chosen.recency >= 0.9) return `Stai giocando/guardando "${chosen.title}"`
  if (chosen.recency >= 0.5) return `Hai giocato/visto di recente "${chosen.title}"`
  return `Perché ami "${chosen.title}" (${label})`
}

const TYPE_FALLBACK: Record<MediaType, string[]> = {
  game: ['Action', 'Role-playing (RPG)', 'Adventure', 'Shooter', 'Strategy'],
  anime: ['Action', 'Adventure', 'Fantasy', 'Drama', 'Comedy'],
  manga: ['Action', 'Adventure', 'Fantasy', 'Drama', 'Romance'],
  movie: ['Action', 'Drama', 'Thriller', 'Comedy', 'Science Fiction'],
  tv: ['Drama', 'Action', 'Thriller', 'Comedy', 'Science Fiction'],
}

const IGDB_ONLY_GENRES = new Set([
  'Role-playing (RPG)', "Hack and slash/Beat 'em up", 'Turn-based strategy (TBS)',
  'Real Time Strategy (RTS)', 'Massively Multiplayer Online (MMO)', 'Battle Royale',
  'Tactical', 'Visual Novel', 'Card & Board Game', 'Indie', 'Arcade', 'Platform',
])

function getGenresForType(type: MediaType, tasteProfile: TasteProfile): string[] {
  if (type !== 'game') {
    const typeSpecific = tasteProfile.topGenres[type]?.map(g => g.genre).filter(g => !IGDB_ONLY_GENRES.has(g)) || []
    if (typeSpecific.length >= 2) return typeSpecific
    const globalFiltered = tasteProfile.globalGenres.map(g => g.genre).filter(g => !IGDB_ONLY_GENRES.has(g))
    if (globalFiltered.length >= 2) return globalFiltered.slice(0, 5)
    return TYPE_FALLBACK[type]
  }
  const gameGenres = tasteProfile.topGenres['game']?.map(g => g.genre) || []
  if (gameGenres.length >= 2) return gameGenres
  return TYPE_FALLBACK['game']
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchAnimeRecs(genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile): Promise<Recommendation[]> {
  if (genres.length === 0) return []
  const ANILIST_GENRES = new Set(['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mecha','Music','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller'])
  const validGenres = genres.filter(g => ANILIST_GENRES.has(g))
  if (validGenres.length === 0) return []
  const topThemes = Object.entries(tasteProfile.deepSignals.themes).sort(([,a],[,b]) => b-a).slice(0,5).map(([t]) => t)
  const query = `query($genres:[String]){Page(page:1,perPage:40){media(genre_in:$genres,type:ANIME,sort:[SCORE_DESC,POPULARITY_DESC],isAdult:false){id title{romaji english}coverImage{large}seasonYear episodes genres description(asHtml:false)averageScore tags{name rank}}}}`
  const res = await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{genres:validGenres.slice(0,4)}}),signal:AbortSignal.timeout(8000)})
  if (!res.ok) return []
  const json = await res.json()
  const media = json.data?.Page?.media || []
  const scored = media
    .filter((m: any) => { const id = `anilist-anime-${m.id}`; return !ownedIds.has(id) && !ownedIds.has(m.id.toString()) && m.coverImage?.large })
    .map((m: any) => { const mTags: string[] = (m.tags||[]).map((t:any)=>t.name.toLowerCase()); let boost=0; for(const theme of topThemes){if(mTags.some(t=>t.includes(theme)))boost+=2}; return{m,boost} })
    .sort((a:any,b:any)=>b.boost-a.boost).slice(0,20)
  return scored.map(({m}:any):Recommendation => {
    const recId=`anilist-anime-${m.id}`;const recGenres:string[]=m.genres||[]
    return{id:recId,title:m.title.romaji||m.title.english||'Senza titolo',type:'anime',coverImage:m.coverImage?.large,year:m.seasonYear,genres:recGenres,score:m.averageScore?Math.min(m.averageScore/20,5):undefined,description:m.description?m.description.replace(/<[^>]+>/g,'').slice(0,300):undefined,why:buildWhy(recGenres,recId,tasteProfile)}
  })
}

async function fetchMangaRecs(genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile): Promise<Recommendation[]> {
  if (genres.length === 0) return []
  const ANILIST_GENRES = new Set(['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Psychological','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller'])
  const validGenres = genres.filter(g => ANILIST_GENRES.has(g))
  if (validGenres.length === 0) return []
  const topThemes = Object.entries(tasteProfile.deepSignals.themes).sort(([,a],[,b]) => b-a).slice(0,5).map(([t]) => t)
  const query = `query($genres:[String]){Page(page:1,perPage:40){media(genre_in:$genres,type:MANGA,format_in:[MANGA,ONE_SHOT],sort:[SCORE_DESC,POPULARITY_DESC]){id title{romaji english}coverImage{large}seasonYear chapters genres description(asHtml:false)averageScore tags{name rank}}}}`
  const res = await fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{genres:validGenres.slice(0,4)}}),signal:AbortSignal.timeout(8000)})
  if (!res.ok) return []
  const json = await res.json()
  const media = json.data?.Page?.media || []
  const scored = media
    .filter((m:any)=>!ownedIds.has(`anilist-manga-${m.id}`)&&m.coverImage?.large)
    .map((m:any)=>{const mTags:string[]=(m.tags||[]).map((t:any)=>t.name.toLowerCase());let boost=0;for(const theme of topThemes){if(mTags.some(t=>t.includes(theme)))boost+=2};return{m,boost}})
    .sort((a:any,b:any)=>b.boost-a.boost).slice(0,20)
  return scored.map(({m}:any):Recommendation=>{
    const recId=`anilist-manga-${m.id}`;const recGenres:string[]=m.genres||[]
    return{id:recId,title:m.title.romaji||m.title.english||'Senza titolo',type:'manga',coverImage:m.coverImage?.large,year:m.seasonYear,genres:recGenres,score:m.averageScore?Math.min(m.averageScore/20,5):undefined,description:m.description?m.description.replace(/<[^>]+>/g,'').slice(0,300):undefined,why:buildWhy(recGenres,recId,tasteProfile)}
  })
}

async function fetchMovieRecs(genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile, tmdbToken: string): Promise<Recommendation[]> {
  if (genres.length===0||!tmdbToken) return []
  const genreIds=genres.map(g=>TMDB_GENRE_MAP[g]).filter(Boolean).slice(0,3).join(',')
  if (!genreIds) return []
  const res=await fetch(`https://api.themoviedb.org/3/discover/movie?with_genres=${genreIds}&sort_by=vote_average.desc&vote_count.gte=100&language=it-IT&page=1`,{headers:{Authorization:`Bearer ${tmdbToken}`,accept:'application/json'},signal:AbortSignal.timeout(8000)})
  if (!res.ok) return []
  const json=await res.json();const results=json.results||[]
  const topKeywords=Object.entries(tasteProfile.deepSignals.keywords).sort(([,a],[,b])=>b-a).slice(0,10).map(([k])=>k)
  const candidates=results.filter((m:any)=>!ownedIds.has(m.id.toString())&&m.poster_path).slice(0,30)
  const keywordsMap=new Map<number,string[]>()
  await Promise.allSettled(candidates.slice(0,15).map(async(m:any)=>{try{const kr=await fetch(`https://api.themoviedb.org/3/movie/${m.id}/keywords`,{headers:{Authorization:`Bearer ${tmdbToken}`,accept:'application/json'},signal:AbortSignal.timeout(3000)});if(!kr.ok)return;const kj=await kr.json();keywordsMap.set(m.id,(kj.keywords||[]).map((k:any)=>k.name.toLowerCase()))}catch{}}))
  const scored=candidates.map((m:any)=>{const kws=keywordsMap.get(m.id)||[];let boost=0;for(const kw of topKeywords){if(kws.some(k=>k.includes(kw)))boost+=1.5};return{m,boost}}).sort((a:any,b:any)=>b.boost-a.boost).slice(0,20)
  return scored.map(({m}:any):Recommendation=>{const recId=m.id.toString();const recGenres=genres.filter(g=>TMDB_GENRE_MAP[g]);return{id:recId,title:m.title||m.original_title||'Senza titolo',type:'movie',coverImage:`https://image.tmdb.org/t/p/w500${m.poster_path}`,year:m.release_date?parseInt(m.release_date.substring(0,4)):undefined,genres:recGenres,score:m.vote_average?Math.min(Math.round(m.vote_average*10)/20,5):undefined,description:m.overview?m.overview.slice(0,300):undefined,why:buildWhy(recGenres,recId,tasteProfile)}})
}

async function fetchTvRecs(genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile, tmdbToken: string): Promise<Recommendation[]> {
  if (genres.length===0||!tmdbToken) return []
  const genreIds=genres.map(g=>TMDB_TV_GENRE_MAP[g]).filter(Boolean).slice(0,3).join(',')
  if (!genreIds) return []
  const res=await fetch(`https://api.themoviedb.org/3/discover/tv?with_genres=${genreIds}&sort_by=vote_average.desc&vote_count.gte=50&language=it-IT&page=1`,{headers:{Authorization:`Bearer ${tmdbToken}`,accept:'application/json'},signal:AbortSignal.timeout(8000)})
  if (!res.ok) return []
  const json=await res.json();const results=json.results||[]
  const topKeywords=Object.entries(tasteProfile.deepSignals.keywords).sort(([,a],[,b])=>b-a).slice(0,10).map(([k])=>k)
  const candidates=results.filter((m:any)=>!ownedIds.has(m.id.toString())&&m.poster_path).slice(0,30)
  const keywordsMap=new Map<number,string[]>()
  await Promise.allSettled(candidates.slice(0,15).map(async(m:any)=>{try{const kr=await fetch(`https://api.themoviedb.org/3/tv/${m.id}/keywords`,{headers:{Authorization:`Bearer ${tmdbToken}`,accept:'application/json'},signal:AbortSignal.timeout(3000)});if(!kr.ok)return;const kj=await kr.json();keywordsMap.set(m.id,(kj.results||[]).map((k:any)=>k.name.toLowerCase()))}catch{}}))
  const scored=candidates.map((m:any)=>{const kws=keywordsMap.get(m.id)||[];let boost=0;for(const kw of topKeywords){if(kws.some(k=>k.includes(kw)))boost+=1.5};return{m,boost}}).sort((a:any,b:any)=>b.boost-a.boost).slice(0,20)
  return scored.map(({m}:any):Recommendation=>{const recId=m.id.toString();const recGenres=genres.filter(g=>TMDB_TV_GENRE_MAP[g]);return{id:recId,title:m.name||m.original_name||'Senza titolo',type:'tv',coverImage:`https://image.tmdb.org/t/p/w500${m.poster_path}`,year:m.first_air_date?parseInt(m.first_air_date.substring(0,4)):undefined,genres:recGenres,score:m.vote_average?Math.min(Math.round(m.vote_average*10)/20,5):undefined,description:m.overview?m.overview.slice(0,300):undefined,why:buildWhy(recGenres,recId,tasteProfile)}})
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, clientSecret: string): Promise<string | null> {
  const now=Date.now()
  if (cachedToken&&cachedToken.expiresAt>now+60_000) return cachedToken.token
  const res=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials'})})
  const data=await res.json()
  if (!data.access_token) return null
  cachedToken={token:data.access_token,expiresAt:now+(data.expires_in||3600)*1000}
  return cachedToken.token
}

async function fetchGameRecs(genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile, clientId: string, clientSecret: string): Promise<Recommendation[]> {
  if (genres.length===0) return []
  const token=await getIgdbToken(clientId,clientSecret)
  if (!token) return []
  const topTones=Object.entries(tasteProfile.deepSignals.tones).sort(([,a],[,b])=>b-a).slice(0,3).map(([t])=>t)
  const genreFilter=genres.slice(0,3).map(g=>`"${g}"`).join(',')
  const body=`fields name,cover.url,first_release_date,summary,genres.name,themes.name,player_perspectives.name,rating,rating_count;where genres.name=(${genreFilter})&rating_count>50&cover!=null;sort rating desc;limit 40;`
  const res=await fetch('https://api.igdb.com/v4/games',{method:'POST',headers:{'Client-ID':clientId,Authorization:`Bearer ${token}`,'Content-Type':'text/plain'},body,signal:AbortSignal.timeout(8000)})
  if (!res.ok) return []
  const games=await res.json()
  if (!Array.isArray(games)) return []
  const scored=games.filter((g:any)=>!ownedIds.has(g.id.toString())&&g.cover?.url).map((g:any)=>{const gameThemes:string[]=(g.themes||[]).map((t:any)=>t.name.toLowerCase());let boost=0;for(const tone of topTones){if(gameThemes.some(t=>t.includes(tone)))boost+=2};return{g,boost}}).sort((a:any,b:any)=>b.boost-a.boost).slice(0,20)
  return scored.map(({g}:any):Recommendation=>{const recId=g.id.toString();const recGenres:string[]=g.genres?.map((gen:any)=>gen.name)||[];return{id:recId,title:g.name,type:'game',coverImage:`https:${g.cover.url.replace('t_thumb','t_cover_big')}`,year:g.first_release_date?new Date(g.first_release_date*1000).getFullYear():undefined,genres:recGenres,score:g.rating?Math.min(Math.round(g.rating)/20,5):undefined,description:g.summary?g.summary.slice(0,300):undefined,why:buildWhy(recGenres,recId,tasteProfile)}})
}

// ── Handler principale ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Rate limit: 10 richieste ogni 5 minuti per IP ──────────────────────
    // Le recommendations sono pesanti (5 API esterne in parallelo)
    const ip = getClientIp(request)
    const rl = checkRateLimit(`recommendations:${ip}`, { limit: 10, windowSecs: 300 })
    if (!rl.success) {
      return NextResponse.json(
        { error: `Troppe richieste. Riprova tra ${rl.retryAfterSecs} secondi.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSecs) } }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    // Rate limit aggiuntivo per user ID (più permissivo dell'IP)
    const rlUser = checkRateLimit(`recommendations:user:${user.id}`, { limit: 20, windowSecs: 300 })
    if (!rlUser.success) {
      return NextResponse.json(
        { error: `Troppe richieste. Riprova tra ${rlUser.retryAfterSecs} secondi.` },
        { status: 429, headers: { 'Retry-After': String(rlUser.retryAfterSecs) } }
      )
    }

    const { searchParams } = new URL(request.url)
    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'

    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, is_steam, title, external_id, appid, updated_at, tags, keywords, themes, player_perspectives')
      .eq('user_id', user.id)

    const allEntries = entries || []

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('recommendations_cache')
        .select('data, expires_at, generated_at')
        .eq('user_id', user.id)
        .eq('media_type', requestedType === 'all' ? 'anime' : requestedType)
        .single()

      if (cached && new Date(cached.expires_at) > new Date()) {
        const cacheGeneratedAt = new Date(cached.generated_at)
        const lastUpdate = allEntries.reduce((latest, e) => {
          const t = new Date(e.updated_at || 0)
          return t > latest ? t : latest
        }, new Date(0))

        if (lastUpdate <= cacheGeneratedAt) {
          if (requestedType === 'all') {
            const { data: allCached } = await supabase
              .from('recommendations_cache')
              .select('media_type, data')
              .eq('user_id', user.id)
            if (allCached && allCached.length > 0) {
              const recommendations: Record<string, any[]> = {}
              for (const c of allCached) recommendations[c.media_type] = c.data
              return NextResponse.json({ recommendations, cached: true })
            }
          } else {
            return NextResponse.json({ recommendations: { [requestedType]: cached.data }, cached: true })
          }
        }
      }
    }

    const { data: preferences } = await supabase
      .from('user_preferences').select('*').eq('user_id', user.id).single()

    const { data: wishlist } = await supabase
      .from('wishlist').select('external_id').eq('user_id', user.id)

    const tasteProfile = computeTasteProfile(allEntries, preferences)

    const ownedIds = new Set<string>([
      ...allEntries.map(e => e.external_id).filter(Boolean),
      ...allEntries.map(e => e.appid).filter(Boolean),
      ...(wishlist || []).map(w => w.external_id).filter(Boolean),
    ])

    const tmdbToken = process.env.NEXT_PUBLIC_TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const typesToFetch: MediaType[] = requestedType === 'all'
      ? ['anime', 'manga', 'movie', 'tv', 'game']
      : [requestedType as MediaType]

    const results = await Promise.allSettled(
      typesToFetch.map(async type => {
        const genres = getGenresForType(type, tasteProfile)
        switch (type) {
          case 'anime': return { type, items: await fetchAnimeRecs(genres, ownedIds, tasteProfile) }
          case 'manga': return { type, items: await fetchMangaRecs(genres, ownedIds, tasteProfile) }
          case 'movie': return { type, items: await fetchMovieRecs(genres, ownedIds, tasteProfile, tmdbToken) }
          case 'tv':    return { type, items: await fetchTvRecs(genres, ownedIds, tasteProfile, tmdbToken) }
          case 'game':  return { type, items: await fetchGameRecs(genres, ownedIds, tasteProfile, igdbClientId, igdbClientSecret) }
        }
      })
    )

    const recommendations: Record<string, Recommendation[]> = {}
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        recommendations[result.value.type] = result.value.items
      }
    }

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

    await Promise.allSettled(
      typesToFetch.map(type =>
        supabase.from('recommendations_cache').upsert({
          user_id: user.id,
          media_type: type,
          data: recommendations[type] || [],
          taste_snapshot: tasteProfile.topGenres,
          generated_at: now,
          expires_at: expiresAt,
        }, { onConflict: 'user_id,media_type' })
      )
    )

    return NextResponse.json({
      recommendations,
      tasteProfile: {
        globalGenres: tasteProfile.globalGenres,
        topGenres: tasteProfile.topGenres,
        collectionSize: tasteProfile.collectionSize,
        recentWindow: tasteProfile.recentWindow,
      },
      cached: false,
    })

  } catch (error) {
    console.error('Recommendations error:', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}