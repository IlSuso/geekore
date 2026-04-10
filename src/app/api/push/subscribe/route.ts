// src/app/api/push/subscribe/route.ts
// Salva o elimina la push subscription di un utente su Supabase.
// Richiede la tabella `push_subscriptions` nel database.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { subscription } = body
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Subscription non valida' }, { status: 400 })
  }

  // Upsert — un dispositivo può aggiornare la propria subscription
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh || null,
      auth: subscription.keys?.auth || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,endpoint' })

  if (error) {
    console.error('[Push Subscribe]', error)
    return NextResponse.json({ error: 'Errore nel salvataggio' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { endpoint } = body

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

  return NextResponse.json({ success: true })
}