import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function getLatestActivities() {
  const { data, error } = await supabase
    .from('activities')
    .select(`
      *,
      profiles (username, avatar_url),
      media (title, type, cover_url)
    `)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Errore nel recupero attività:', error)
    return []
  }
  return data
}

export async function getTrendingMedia(type: 'game' | 'anime' | 'manga') {
  const { data, error } = await supabase
    .from('media')
    .select('*')
    .eq('type', type)
    .limit(10)

  if (error) return []
  return data
}
