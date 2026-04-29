import type { Recommendation, TasteProfile } from './types'
import type { MediaType, UserEntry } from './engine-types'
import { buildWhyV3, computeMatchScore } from './profile'

type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
export async function fetchContinuityRecs(
  entries: UserEntry[],
  ownedIds: Set<string>,
  tasteProfile: TasteProfile,
  supabase: SupabaseClient
): Promise<Recommendation[]> {
  const continuityRecs: Recommendation[] = []
  const seen = new Set<string>()

  // Trova entries completate con rating ≥ 3
  const completedEntries = entries.filter(e =>
    (e.status === 'completed' || (e.current_episode && e.episodes && e.current_episode / e.episodes >= 0.8)) &&
    (e.rating || 0) >= 3 &&
    e.external_id
  )

  if (completedEntries.length === 0) return []

  // Cerca sequel/prequel in DB locale
  const fromIds = completedEntries.map(e => e.external_id).slice(0, 20)
  const { data: continuityEdges } = await supabase
    .from('media_continuity')
    .select('*')
    .in('from_id', fromIds)
    .order('priority', { ascending: true })

  // Se non ci sono edge nel DB locale, tenta di fetcharli da AniList
  const anilistCompleted = completedEntries.filter(e => e.external_id?.startsWith('anilist-'))
  const continuityFromAniList = await fetchAniListContinuity(anilistCompleted, ownedIds)

  const allEdges = [...(continuityEdges || []), ...continuityFromAniList]

  for (const edge of allEdges) {
    if (ownedIds.has(edge.to_id) || seen.has(edge.to_id)) continue
    seen.add(edge.to_id)

    const sourceEntry = completedEntries.find(e => e.external_id === edge.from_id)
    if (!sourceEntry) continue

    const recGenres: string[] = sourceEntry.genres || []
    const matchScore = computeMatchScore(recGenres, [], tasteProfile)

    continuityRecs.push({
      id: edge.to_id,
      title: edge.to_title || `Continua: ${sourceEntry.title}`,
      type: (edge.to_type as MediaType) || sourceEntry.type,
      coverImage: edge.to_cover,
      year: edge.to_year,
      genres: recGenres,
      why: buildWhyV3(recGenres, edge.to_id, edge.to_title || '', tasteProfile, matchScore, false, {
        isContinuity: true,
        continuityFrom: sourceEntry.title,
      }),
      matchScore: Math.min(100, matchScore + 20), // priority boost
      isContinuity: true,
      continuityFrom: sourceEntry.title,
    })
  }

  return continuityRecs.slice(0, 3) // max 3 continuity cards
}

// Fetch sequels direttamente da AniList per le entry anilist
async function fetchAniListContinuity(entries: UserEntry[], ownedIds: Set<string>): Promise<Recommendation[]> {
  const results: any[] = []

  for (const entry of entries.slice(0, 5)) {
    const id = entry.external_id?.replace('anilist-anime-', '').replace('anilist-manga-', '')
    if (!id || isNaN(Number(id))) continue

    const mediaType = entry.external_id?.includes('anime') ? 'ANIME' : 'MANGA'
    const query = `
      query($id: Int) {
        Media(id: $id) {
          relations {
            edges {
              relationType
              node { id type title { romaji } coverImage { extraLarge large } seasonYear genres averageScore }
            }
          }
        }
      }
    `
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: Number(id) } }),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const edges = json.data?.Media?.relations?.edges || []

      for (const edge of edges) {
        const rel = edge.relationType
        if (!['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'].includes(rel)) continue

        const node = edge.node
        const toId = `anilist-${node.type === 'ANIME' ? 'anime' : 'manga'}-${node.id}`
        if (ownedIds.has(toId)) continue

        const priority = rel === 'SEQUEL' ? 1 : rel === 'PREQUEL' ? 2 : 3
        results.push({
          from_id: entry.external_id,
          to_id: toId,
          to_type: node.type === 'ANIME' ? 'anime' : 'manga',
          to_title: node.title?.romaji || '',
          to_cover: node.coverImage?.extraLarge || node.coverImage?.large,
          to_year: node.seasonYear,
          edge_type: rel.toLowerCase(),
          priority,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => a.priority - b.priority)
}

// ── #8 Platform Awareness — mappa ID TMDb → nome piattaforma ─────────────────
