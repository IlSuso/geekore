import { after } from 'next/server'
import type { Recommendation, TasteProfile } from '@/lib/reco/types'
import type { SupabaseClient } from './context'
import type { MasterHealth } from './masterState'

export function persistCreatorProfile(
  supabase: SupabaseClient,
  userId: string,
  tasteProfile: TasteProfile,
) {
  after(async () => {
    try {
      const topStudios = Object.entries(tasteProfile.creatorScores.studios).sort(([, a], [, b]) => b - a).slice(0, 30)
      const topDirectors = Object.entries(tasteProfile.creatorScores.directors).sort(([, a], [, b]) => b - a).slice(0, 30)

      await supabase.from('user_creator_profile').upsert({
        user_id: userId,
        studios: Object.fromEntries(topStudios),
        directors: Object.fromEntries(topDirectors),
        authors: Object.fromEntries(Object.entries(tasteProfile.creatorScores.authors).sort(([, a], [, b]) => b - a).slice(0, 20)),
        developers: Object.fromEntries(Object.entries(tasteProfile.creatorScores.developers).sort(([, a], [, b]) => b - a).slice(0, 20)),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    } catch {
      // background profile persistence is best-effort
    }
  })
}

export function buildTasteProfileResponse(tasteProfile: TasteProfile) {
  const topStudiosForResponse = Object.entries(tasteProfile.creatorScores.studios).sort(([, a], [, b]) => b - a).slice(0, 5)
  const topDirectorsForResponse = Object.entries(tasteProfile.creatorScores.directors).sort(([, a], [, b]) => b - a).slice(0, 5)

  return {
    globalGenres: tasteProfile.globalGenres,
    topGenres: tasteProfile.topGenres,
    collectionSize: tasteProfile.collectionSize,
    recentWindow: tasteProfile.recentWindow,
    deepSignals: {
      topThemes: Object.entries(tasteProfile.deepSignals.themes)
        .sort(([, a], [, b]) => b - a).slice(0, 5).map(([k]) => k),
      topTones: Object.entries(tasteProfile.deepSignals.tones)
        .sort(([, a], [, b]) => b - a).slice(0, 5).map(([k]) => k),
      topSettings: Object.entries(tasteProfile.deepSignals.settings)
        .sort(([, a], [, b]) => b - a).slice(0, 4).map(([k]) => k),
    },
    discoveryGenres: tasteProfile.discoveryGenres,
    negativeGenres: Object.keys(tasteProfile.negativeGenres).slice(0, 5),
    creatorScores: {
      topStudios: topStudiosForResponse.map(([name, score]) => ({ name, score })),
      topDirectors: topDirectorsForResponse.map(([name, score]) => ({ name, score })),
    },
    bingeProfile: tasteProfile.bingeProfile,
    wishlistGenres: tasteProfile.wishlistGenres,
    searchIntentGenres: tasteProfile.searchIntentGenres,
  }
}

export function updateRecommendationPoolProfile({
  supabase,
  userId,
  recommendations,
  poolByType,
  collectionHash,
  tasteProfileResponse,
  totalEntries,
}: {
  supabase: SupabaseClient
  userId: string
  recommendations: Record<string, Recommendation[]>
  poolByType: Map<string, Recommendation[]>
  collectionHash: string
  tasteProfileResponse: ReturnType<typeof buildTasteProfileResponse>
  totalEntries: number
}) {
  const profileUpdateUpserts = Object.keys(recommendations)
    .filter(type => (poolByType.get(type) || []).length > 0)
    .map(type => ({
      user_id: userId,
      media_type: type,
      data: poolByType.get(type) || [],
      generated_at: new Date().toISOString(),
      collection_hash: collectionHash,
      taste_profile: tasteProfileResponse,
      total_entries: totalEntries,
    }))

  if (profileUpdateUpserts.length > 0) {
    after(async () => {
      try {
        await supabase.from('recommendations_pool').upsert(profileUpdateUpserts, {
          onConflict: 'user_id,media_type',
        })
      } catch {
        // background pool profile persistence is best-effort
      }
    })
  }
}

export function buildPoolHealthDiagnostics({
  masterHealthByType,
  rowByType,
  masterByType,
  allShownKeys,
}: {
  masterHealthByType: Map<string, MasterHealth>
  rowByType: Map<any, any>
  masterByType: Map<string, Recommendation[]>
  allShownKeys: Set<string>
}) {
  return Object.fromEntries([...masterHealthByType.entries()].map(([type, health]) => {
    const row = rowByType.get(type)
    const generatedAt = row?.generated_at ? new Date(row.generated_at).getTime() : 0
    const currentItems = masterByType.get(type) || []
    const currentShownCount = currentItems.filter(item =>
      allShownKeys.has(`${type}:${item.id}`) ||
      allShownKeys.has(`${item.type || type}:${item.id}`) ||
      allShownKeys.has(`:${item.id}`)
    ).length
    const currentUnseenCount = Math.max(0, currentItems.length - currentShownCount)
    const currentShownRatio = currentItems.length > 0 ? currentShownCount / currentItems.length : 0

    return [type, {
      ...health,
      size: currentItems.length,
      unseenCount: currentUnseenCount,
      shownRatio: Math.round(currentShownRatio * 1000) / 1000,
      ageHours: generatedAt ? Math.round(((Date.now() - generatedAt) / 3600000) * 10) / 10 : null,
    }]
  }))
}
