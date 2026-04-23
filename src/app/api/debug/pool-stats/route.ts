import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const [{ data: master }, { data: pool }] = await Promise.all([
    supabase.from('master_recommendations_pool').select('media_type, data').eq('user_id', user.id),
    supabase.from('recommendations_pool').select('media_type, data, generated_at').eq('user_id', user.id),
  ])

  const masterStats = Object.fromEntries(
    (master || []).map(r => [r.media_type, (r.data as any[])?.length ?? 0])
  )
  const poolStats = Object.fromEntries(
    (pool || []).map(r => [r.media_type, { count: (r.data as any[])?.length ?? 0, generated_at: r.generated_at }])
  )

  return NextResponse.json({ master: masterStats, pool: poolStats })
}
