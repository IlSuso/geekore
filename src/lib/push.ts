// src/lib/push.ts
// Utility server-side per inviare notifiche push via Web Push API.
// Usa la libreria `web-push`. Installa con: npm install web-push @types/web-push
//
// Variabili d'ambiente richieste in .env.local:
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_EMAIL=mailto:admin@geekore.it
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=... (stessa di VAPID_PUBLIC_KEY, esposta al client)
//
// Genera le chiavi con: npx web-push generate-vapid-keys

import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

// Configura VAPID solo se le chiavi sono presenti (evita crash in dev senza .env)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@geekore.it',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  url?: string
  tag?: string
}

/**
 * Invia una notifica push a tutti i dispositivi di un utente.
 * Rimuove automaticamente le subscription scadute.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('[Push] VAPID keys non configurate — notifica non inviata')
    return
  }

  const supabase = await createClient()

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subscriptions?.length) return

  const expiredEndpoints: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh || '',
              auth: sub.auth || '',
            },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 } // 24 ore
        )
      } catch (err: any) {
        // 410 Gone = subscription scaduta/revocata
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpoints.push(sub.endpoint)
        } else {
          console.error('[Push] Errore invio:', err.message)
        }
      }
    })
  )

  // Pulisci subscription scadute
  if (expiredEndpoints.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', expiredEndpoints)
  }
}

/**
 * Payload helper — notifica di like su un post.
 */
export function likePayload(senderUsername: string, postId: string): PushPayload {
  return {
    title: 'Geekore',
    body: `@${senderUsername} ha messo like al tuo post`,
    url: `/feed`,
    tag: `like-${postId}`,
  }
}

/**
 * Payload helper — notifica di nuovo follower.
 */
export function followPayload(senderUsername: string): PushPayload {
  return {
    title: 'Geekore',
    body: `@${senderUsername} ha iniziato a seguirti`,
    url: `/profile/${senderUsername}`,
    tag: `follow-${senderUsername}`,
  }
}

/**
 * Payload helper — notifica di commento.
 */
export function commentPayload(senderUsername: string, postId?: string): PushPayload {
  return {
    title: 'Geekore',
    body: `@${senderUsername} ha commentato`,
    url: postId ? `/feed` : `/notifications`,
    tag: `comment-${postId || 'profile'}`,
  }
}