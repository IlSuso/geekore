import { logger } from '@/lib/logger'
// src/app/api/push/subscribe/route.ts
// Salva o elimina la push subscription di un utente su Supabase.
// Richiede la tabella `push_subscriptions` nel database.

import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'

function cleanEndpoint(value: unknown): string {
  if (typeof value !== 'string') return ''
  const cleaned = value.trim()
  if (!cleaned || cleaned.length > 2000) return ''
  try {
    const url = new URL(cleaned)
    if (url.protocol !== 'https:') return ''
    return cleaned
  } catch {
    return ''
  }
}

function cleanKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (!cleaned || cleaned.length > 512) return null
  return cleaned
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'push:subscribe' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { 
    body = await request.json() 
  } catch {
    return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers })
  }

  const subscription = body?.subscription
  const endpoint = cleanEndpoint(subscription?.endpoint)
  if (!endpoint) {
    return NextResponse.json({ error: apiMessage(request, 'invalidSubscription') }, { status: 400, headers: rl.headers })
  }

  // Upsert — un dispositivo può aggiornare la propria subscription
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint,
      p256dh: cleanKey(subscription?.keys?.p256dh),
      auth: cleanKey(subscription?.keys?.auth),
      updated_at: new Date().toISOString(),
    }, { 
      onConflict: 'user_id,endpoint' 
    })

  if (error) {
    logger.error('[Push Subscribe]', 'Errore salvataggio subscription', { message: error.message })
    return NextResponse.json({ error: apiMessage(request, 'saveError') }, { status: 500, headers: rl.headers })
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'push:unsubscribe' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { 
    body = await request.json() 
  } catch {
    body = {}
  }

  const endpoint = cleanEndpoint(body?.endpoint)

  if (endpoint) {
    // Elimina solo questo dispositivo
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)
  } else {
    // Elimina tutti i dispositivi dell'utente
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
