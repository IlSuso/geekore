import { NextRequest, NextResponse } from 'next/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import { translateDescriptionIfNeeded } from '@/lib/descriptionTranslation'

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'translate:description' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const id = typeof body?.id === 'string' && body.id.trim() ? body.id.trim().slice(0, 180) : `manual:${Date.now()}`
  const description = await translateDescriptionIfNeeded(id, body?.text ?? body?.description, {
    maxLen: typeof body?.maxLen === 'number' ? Math.min(Math.max(body.maxLen, 120), 3000) : 900,
    force: body?.force === true,
    cachePrefix: 'api-description',
  })

  return NextResponse.json({ description: description || '' }, { headers: rl.headers })
}
