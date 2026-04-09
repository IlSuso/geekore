import { createClient } from './supabase/client'

type ActivityType =
  | 'media_added'
  | 'media_completed'
  | 'media_dropped'
  | 'media_progress'
  | 'rating_given'
  | 'steam_imported'

interface LogActivityParams {
  type: ActivityType
  media_id?: string
  media_title?: string
  media_type?: string
  media_cover?: string
  progress_value?: number
  rating_value?: number
  metadata?: Record<string, any>
}

export async function logActivity(params: LogActivityParams) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('activity_log').insert({
      user_id: user.id,
      ...params,
      metadata: params.metadata || {},
    })
  } catch {
    // Non bloccare mai l'azione principale per un errore di log
  }
}