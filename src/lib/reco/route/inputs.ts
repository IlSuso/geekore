import type { MediaType, UserEntry } from '@/lib/reco/engine-types'
import { computeTasteProfile } from '@/lib/reco/profile'
import type { SupabaseClient } from './context'

export type WishlistRawItem = {
  external_id: string
  genres: string[]
  media_type: string
  title: string
  studios: string
}

export async function loadRecommendationInputs(supabase: SupabaseClient, userId: string) {
  // CRITICAL: .limit(10000) bypassa il cap di default di Supabase (1000 righe).
  const { data: entries } = await supabase
    .from('user_media_entries')
    .select('type, rating, genres, current_episode, episodes, status, is_steam, title, title_en, external_id, appid, updated_at, tags, keywords, themes, player_perspectives, studios, directors, authors, developer, rewatch_count, completed_at, started_at, my_status, steam_playtime_forever, steam_last_played, achievements_unlocked, achievements_total')
    .eq('user_id', userId)
    .limit(10000)

  const allEntries: UserEntry[] = (entries || []) as UserEntry[]

  const lastCollectionUpdate = allEntries.reduce((latest: Date, e: UserEntry) => {
    const t = new Date(e.updated_at || 0)
    return t > latest ? t : latest
  }, new Date(0))

  const [
    { data: preferences },
    { data: wishlistRaw },
    { data: searchHistory },
  ] = await Promise.all([
    supabase.from('user_preferences').select('*').eq('user_id', userId).single(),
    supabase.from('wishlist').select('external_id, genres, media_type, title, studios').eq('user_id', userId),
    supabase.from('search_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
  ])

  const wishlistItems: UserEntry[] = (wishlistRaw || []).map((w: WishlistRawItem) => ({
    title: w.title || '',
    type: (w.media_type || 'movie') as MediaType,
    external_id: w.external_id,
    genres: w.genres,
    studio: w.studios,
  }))

  const searches = searchHistory || []
  const userPlatformIds: number[] = (preferences as any)?.streaming_platforms || []
  const tasteProfile = computeTasteProfile(allEntries, preferences, wishlistItems, searches)

  return {
    allEntries,
    lastCollectionUpdate,
    preferences,
    wishlistRaw: (wishlistRaw || []) as WishlistRawItem[],
    wishlistItems,
    searches,
    userPlatformIds,
    tasteProfile,
  }
}
