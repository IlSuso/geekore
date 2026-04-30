import type { MediaType } from '../engine-types'
import { ADJACENCY_GRAPH } from '../genre-maps'
import { buildDiversitySlots, type GenreSlot } from '../slots'
import type { TasteProfile } from '../types'

const IGDB_ONLY = new Set([
  'Role-playing (RPG)', "Hack and slash/Beat 'em up", 'Turn-based strategy (TBS)',
  'Real Time Strategy (RTS)', 'Massively Multiplayer Online (MMO)', 'Battle Royale',
  'Tactical', 'Visual Novel', 'Card & Board Game', 'Arcade', 'Platform', 'Shooter',
  'Fighting', 'Sport', 'Racing',
])

const DIRECT_GENRE_TYPES = new Set<MediaType>(['anime', 'manga', 'movie', 'tv'])

export interface RecruitmentSlotPlan {
  slots: GenreSlot[]
  diagnostics: {
    baseSlots: number
    crossMediaSlots: number
    adjacencySlots: number
    discoverySlots: number
    plannedQuota: number
  }
}

function addSlot(slots: GenreSlot[], genre: string, quota: number, flags: Partial<GenreSlot> = {}) {
  if (!genre || quota <= 0) return
  const existing = slots.find(slot => slot.genre === genre)
  if (existing) {
    existing.quota = Math.max(existing.quota, quota)
    existing.isDiscovery = existing.isDiscovery || !!flags.isDiscovery
    existing.isSerendipity = existing.isSerendipity || !!flags.isSerendipity
    return
  }
  slots.push({ genre, quota, isDiscovery: !!flags.isDiscovery, isSerendipity: flags.isSerendipity })
}

export function buildRecruitmentSlots(
  type: MediaType,
  tasteProfile: TasteProfile,
  totalSlots: number
): RecruitmentSlotPlan {
  const baseSlots = buildDiversitySlots(type, tasteProfile, totalSlots)

  if (!DIRECT_GENRE_TYPES.has(type)) {
    return {
      slots: baseSlots,
      diagnostics: {
        baseSlots: baseSlots.length,
        crossMediaSlots: 0,
        adjacencySlots: 0,
        discoverySlots: baseSlots.filter(slot => slot.isDiscovery).length,
        plannedQuota: baseSlots.reduce((sum, slot) => sum + slot.quota, 0),
      },
    }
  }

  const slots: GenreSlot[] = []
  for (const slot of baseSlots) addSlot(slots, slot.genre, slot.quota, slot)

  const present = new Set(slots.map(slot => slot.genre))
  const softDisliked = tasteProfile.softDisliked || new Set<string>()
  let crossMediaSlots = 0
  let adjacencySlots = 0
  let discoverySlots = slots.filter(slot => slot.isDiscovery).length

  for (const source of tasteProfile.globalGenres.slice(0, 10)) {
    if (crossMediaSlots >= 4) break
    if (present.has(source.genre) || IGDB_ONLY.has(source.genre) || softDisliked.has(source.genre)) continue
    addSlot(slots, source.genre, Math.max(3, Math.round(totalSlots * 0.035)), { isDiscovery: true })
    present.add(source.genre)
    crossMediaSlots++
    discoverySlots++
  }

  for (const source of tasteProfile.globalGenres.slice(0, 5)) {
    if (adjacencySlots >= 4) break
    const adjacent = ADJACENCY_GRAPH[source.genre] || []
    for (const genre of adjacent) {
      if (adjacencySlots >= 4) break
      if (present.has(genre) || IGDB_ONLY.has(genre) || softDisliked.has(genre)) continue
      addSlot(slots, genre, 2, { isDiscovery: true })
      present.add(genre)
      adjacencySlots++
      discoverySlots++
    }
  }

  for (const genre of tasteProfile.discoveryGenres || []) {
    if (discoverySlots >= 8) break
    if (present.has(genre) || IGDB_ONLY.has(genre) || softDisliked.has(genre)) continue
    addSlot(slots, genre, 2, { isDiscovery: true, isSerendipity: true })
    present.add(genre)
    discoverySlots++
  }

  return {
    slots,
    diagnostics: {
      baseSlots: baseSlots.length,
      crossMediaSlots,
      adjacencySlots,
      discoverySlots,
      plannedQuota: slots.reduce((sum, slot) => sum + slot.quota, 0),
    },
  }
}
