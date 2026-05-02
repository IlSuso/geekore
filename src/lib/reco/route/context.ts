import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

export type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type RecommendationRouteContext =
  | {
      response: NextResponse
      searchParams?: never
      supabase?: never
      userId?: never
      isServiceCall?: never
    }
  | {
      response?: undefined
      searchParams: URLSearchParams
      supabase: SupabaseClient
      userId: string
      isServiceCall: boolean
    }

export async function resolveRecommendationContext(request: NextRequest): Promise<RecommendationRouteContext> {
  const { searchParams } = new URL(request.url)
  const serviceUserId = request.headers.get('X-Service-User-Id')
  const serviceSecret = request.headers.get('X-Service-Secret')
  const cronSecret = process.env.CRON_SECRET
  const isServiceCall = !!(serviceUserId && cronSecret && serviceSecret === cronSecret)

  logger.info('recommendations', `GET called, isServiceCall=${isServiceCall}`)

  // Rate limit solo per chiamate esterne — le interne sono già serializzate dal cron
  if (!isServiceCall) {
    const rl = rateLimit(request, { limit: 10, windowMs: 60_000 })
    if (!rl.ok) return { response: NextResponse.json({ error: 'Too many requests' }, { status: 429 }) }
  }

  let supabase = await createClient()
  let userId: string

  if (isServiceCall) {
    if (!serviceUserId || !UUID_RE.test(serviceUserId)) {
      return { response: NextResponse.json({ error: 'Service user id non valido' }, { status: 400 }) }
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { response: NextResponse.json({ error: 'Configurazione Supabase server mancante' }, { status: 503 }) }
    }

    const { createClient: createServiceClient } = await import('@supabase/supabase-js')
    supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    ) as any
    userId = serviceUserId
    logger.info('recommendations', `[SERVICE CALL] Regen per userId=${userId}`)
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { response: NextResponse.json({ error: 'Non autenticato' }, { status: 401 }) }
    userId = user.id
  }

  return { searchParams, supabase, userId, isServiceCall }
}
