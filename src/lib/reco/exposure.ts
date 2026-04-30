import type { Recommendation } from './types'
import type { RecommendationExposure } from './sampler'

type SupabaseLike = {
  from: (table: string) => any
}

export async function loadRecommendationExposures(
  supabase: SupabaseLike,
  userId: string,
  days = 14
): Promise<RecommendationExposure[]> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString()
  const { data } = await supabase
    .from('recommendations_shown')
    .select('rec_id, rec_type, shown_at, action')
    .eq('user_id', userId)
    .gte('shown_at', cutoff)

  return (data || []) as RecommendationExposure[]
}

export async function loadAllRecommendationExposureKeys(
  supabase: SupabaseLike,
  userId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('recommendations_shown')
    .select('rec_id, rec_type')
    .eq('user_id', userId)

  return new Set(
    (data || [])
      .filter((row: any) => row.rec_id)
      .map((row: any) => `${row.rec_type || ''}:${row.rec_id}`)
  )
}

export async function recordRecommendationExposures(
  supabase: SupabaseLike,
  userId: string,
  recommendations: Record<string, Recommendation[]>
) {
  const now = new Date().toISOString()
  const rows = Object.entries(recommendations).flatMap(([type, recs]) =>
    recs.map(rec => ({
      user_id: userId,
      rec_id: rec.id,
      rec_type: type,
      shown_at: now,
      // action intentionally omitted: preserve existing feedback action on conflict
    }))
  )

  if (rows.length === 0) return

  // CRITICAL FIX: aggiorna shown_at ad ogni esposizione così il cooldown funziona.
  // ignoreDuplicates:false + update su shown_at sovrascrive la data ogni volta che
  // il titolo viene servito, garantendo che HARD_COOLDOWN_HOURS (4h) funzioni davvero.
  // Se la riga ha già un'action (not_interested/already_seen), la preserviamo via SQL merge.
  await supabase.from('recommendations_shown').upsert(rows, {
    onConflict: 'user_id,rec_id',
    ignoreDuplicates: false,
  })
}
