import type { GenreSlot } from './slots'
import { BGG_TO_CROSS_GENRE } from './genre-maps'
import { buildWhyV3, computeMatchScore } from './profile'
import { releaseFreshnessMult } from './scoring'
import type { Recommendation, TasteProfile } from './types'

type SupabaseLike = {
  from: (table: string) => any
}

type BGGCatalogRow = {
  bgg_id: number
  title: string
  year_published: number | null
  rank: number | null
  average_rating: number | null
  users_rated: number | null
  categories: string[] | null
  mechanics: string[] | null
  image_url: string | null
  thumbnail_url: string | null
  min_players: number | null
  max_players: number | null
  playing_time: number | null
  complexity: number | null
  designers: string[] | null
  description: string | null
}

const CATALOG_FETCH_LIMIT = 5000
const CATALOG_RESULT_LIMIT = 260
const MIN_CATALOG_MATCH_SCORE = 32

function toCrossGenres(categories: string[] = []) {
  const crossGenres = new Set<string>()
  for (const category of categories) {
    crossGenres.add(category)
    const mapped = BGG_TO_CROSS_GENRE[category]
    if (mapped) for (const genre of mapped) crossGenres.add(genre)
  }
  return [...crossGenres]
}

function objectiveBoost(row: BGGCatalogRow) {
  let boost = 0
  const rank = row.rank || 999999
  const rating = row.average_rating || 0
  const usersRated = row.users_rated || 0

  if (rating >= 7.7 && usersRated >= 500) boost += 8
  else if (rating >= 7.2 && usersRated >= 250) boost += 5
  else if (rating >= 6.8 && usersRated >= 100) boost += 3

  if (rank <= 100) boost += 5
  else if (rank <= 500) boost += 4
  else if (rank <= 1500) boost += 2

  return boost
}

export async function loadBGGCatalogCandidates(
  supabase: SupabaseLike | undefined,
  slots: GenreSlot[],
  tasteProfile: TasteProfile,
  isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>
): Promise<Recommendation[]> {
  if (!supabase) return []

  const slotGenres = new Set(slots.map(slot => slot.genre))
  const wantedCategories = [...slotGenres]

  let query = supabase
    .from('bgg_catalog')
    .select('bgg_id,title,year_published,rank,average_rating,users_rated,categories,mechanics,image_url,thumbnail_url,min_players,max_players,playing_time,complexity,designers,description')
    .not('title', 'is', null)
    .not('image_url', 'is', null)
    .gte('users_rated', 80)
    .gte('average_rating', 5.7)
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(CATALOG_FETCH_LIMIT)

  if (wantedCategories.length > 0) {
    query = query.overlaps('categories', wantedCategories)
  }

  const { data, error } = await query
  if (error || !Array.isArray(data)) return []

  const results: Recommendation[] = []
  const seen = new Set<string>()

  for (const row of data as BGGCatalogRow[]) {
    const recId = `bgg-${row.bgg_id}`
    if (!row.bgg_id || !row.title || seen.has(recId)) continue
    if (shownIds?.has(recId)) continue
    if (isAlreadyOwned('boardgame', recId, row.title)) continue

    const categories = row.categories || []
    const mechanics = row.mechanics || []
    const recGenres = toCrossGenres(categories)
    const matchScore = computeMatchScore(recGenres, mechanics, tasteProfile, [], [])
    let finalScore = Math.min(100, Math.round((matchScore + objectiveBoost(row)) * releaseFreshnessMult(row.year_published || undefined)))
    if (finalScore < MIN_CATALOG_MATCH_SCORE) continue

    const bestSlot = slots.find(slot =>
      categories.some(category => category.toLowerCase().includes(slot.genre.toLowerCase()))
    )

    seen.add(recId)
    results.push({
      id: recId,
      title: row.title,
      type: 'boardgame',
      coverImage: row.image_url || row.thumbnail_url || undefined,
      year: row.year_published || undefined,
      genres: categories.length > 0 ? categories : recGenres,
      score: row.average_rating ? Math.round((row.average_rating / 2) * 10) / 10 : undefined,
      description: row.description || undefined,
      why: buildWhyV3(recGenres, recId, row.title, tasteProfile, matchScore, !!bestSlot?.isDiscovery, {}),
      matchScore: finalScore,
      isDiscovery: !!bestSlot?.isDiscovery,
      isAwardWinner: (row.average_rating || 0) >= 7.5 && (row.users_rated || 0) >= 500,
      min_players: row.min_players || undefined,
      max_players: row.max_players || undefined,
      playing_time: row.playing_time || undefined,
      complexity: row.complexity || undefined,
      mechanics: mechanics.slice(0, 8),
      designers: (row.designers || []).slice(0, 3),
    } as any)
  }

  return results
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, CATALOG_RESULT_LIMIT)
}
