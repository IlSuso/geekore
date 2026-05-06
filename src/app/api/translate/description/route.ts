import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import { translateDescriptionIfNeeded } from '@/lib/descriptionTranslation'

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'translate:description' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const id = typeof body?.id === 'string' && body.id.trim() ? body.id.trim().slice(0, 180) : `manual:${Date.now()}`
  const description = await translateDescriptionIfNeeded(id, body?.text ?? body?.description, {
    maxLen: typeof body?.maxLen === 'number' ? Math.min(Math.max(body.maxLen, 120), 3000) : 900,
    force: body?.force === true,
    cachePrefix: 'api-description',
  })

  return NextResponse.json({ description: description || '' }, { headers: rl.headers })
}
