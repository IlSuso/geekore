// src/app/api/push/test/route.ts
// ⚠️ TEMPORANEO — rimuovere dopo il debug
// Manda una notifica push di test all'utente loggato.
// Chiama con: POST /api/push/test

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

export async function POST() {
  // 1. Controlla VAPID keys
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({
      error: 'VAPID keys mancanti sul server',
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ? '✅ presente' : '❌ MANCANTE',
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ? '✅ presente' : '❌ MANCANTE',
      VAPID_EMAIL: process.env.VAPID_EMAIL || '❌ MANCANTE',
    }, { status: 500 })
  }

  // 2. Utente loggato
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  // 3. Conta le subscription nel DB
  const { data: subs, error: dbError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', user.id)

  if (dbError) {
    return NextResponse.json({ error: 'Errore DB', detail: dbError.message }, { status: 500 })
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({
      error: 'Nessuna subscription nel DB per questo utente',
      user_id: user.id,
      suggerimento: 'Premi "Disattiva" e poi "Attiva" nel toggle notifiche per re-iscriverti',
    }, { status: 404 })
  }

  // 4. Tenta l'invio
  try {
    await sendPushToUser(user.id, {
      title: '🔔 Test Geekore',
      body: 'Se vedi questo, le notifiche push funzionano!',
      url: '/notifications',
      tag: 'debug-test',
    })

    return NextResponse.json({
      success: true,
      message: `Notifica inviata a ${subs.length} dispositivo/i`,
      subscriptions_found: subs.length,
      endpoints: subs.map(s => s.endpoint.slice(0, 50) + '...'),
    })
  } catch (e: any) {
    return NextResponse.json({
      error: 'Errore durante sendPushToUser',
      detail: e.message,
      stack: e.stack?.slice(0, 300),
    }, { status: 500 })
  }
}