import type { SupabaseClient } from './context'

export async function loadSocialFavorites(
  supabase: SupabaseClient,
  userId: string,
  ownedIds: Set<string>,
): Promise<Map<string, string>> {
  const { data: similarFriends } = await supabase
    .from('taste_similarity')
    .select('other_user_id, similarity_score')
    .eq('user_id', userId)
    .gte('similarity_score', 70)
    .order('similarity_score', { ascending: false })
    .limit(5)

  const socialFavorites = new Map<string, string>()
  if (!similarFriends || similarFriends.length === 0) return socialFavorites

  const friendIds = similarFriends.map((f: any) => f.other_user_id)
  const { data: friendEntries } = await supabase
    .from('user_media_entries')
    .select('user_id, external_id, rating')
    .in('user_id', friendIds)
    .gte('rating', 4)

  if (!friendEntries) return socialFavorites

  for (const fe of friendEntries) {
    if (!fe.external_id || ownedIds.has(fe.external_id)) continue
    if (!socialFavorites.has(fe.external_id)) {
      const friend = similarFriends.find((f: any) => f.other_user_id === fe.user_id)
      if (friend) socialFavorites.set(fe.external_id, `${Math.round(friend.similarity_score)}%`)
    }
  }

  return socialFavorites
}
