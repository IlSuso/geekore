// src/lib/push.ts

import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'

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

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const tag = `[Push:${payload.tag || 'notif'}]`

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error(`${tag} ❌ VAPID keys mancanti sul server`)
    return
  }

  // FIX: usa service client per bypassare la RLS su push_subscriptions
  const supabase = createServiceClient()

  const { data: subscriptions, error: dbError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (dbError) {
    console.error(`${tag} ❌ Errore DB per user ${userId}:`, dbError.message)
    return
  }

  if (!subscriptions || subscriptions.length === 0) {
    console.warn(`${tag} ⚠️ Nessuna subscription trovata nel DB per user ${userId}`)
    return
  }

  console.log(`${tag} 📤 Invio a ${subscriptions.length} dispositivo/i per user ${userId} — payload: "${payload.body}"`)

  const expiredEndpoints: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub, i) => {
      const endpointShort = sub.endpoint.slice(0, 60) + '...'
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
          { TTL: 60 * 60 * 24 }
        )
        console.log(`${tag} ✅ Inviato dispositivo #${i + 1}: ${endpointShort}`)
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.warn(`${tag} ♻️ Subscription scaduta (${err.statusCode}), verrà rimossa: ${endpointShort}`)
          expiredEndpoints.push(sub.endpoint)
        } else {
          console.error(`${tag} ❌ Errore invio #${i + 1} (status ${err.statusCode}): ${err.message}`)
        }
      }
    })
  )

  if (expiredEndpoints.length > 0) {
    console.log(`${tag} 🗑️ Rimozione ${expiredEndpoints.length} subscription scadute`)
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .in('endpoint', expiredEndpoints)
  }
}

export function likePayload(senderUsername: string, postId: string): PushPayload {
  return {
    title: 'Geekore',
    body: `@${senderUsername} ha messo like al tuo post`,
    url: `/feed`,
    tag: `like-${postId}`,
  }
}

export function followPayload(senderUsername: string): PushPayload {
  return {
    title: 'Geekore',
    body: `@${senderUsername} ha iniziato a seguirti`,
    url: `/profile/${senderUsername}`,
    tag: `follow-${senderUsername}`,
  }
}

export function commentPayload(senderUsername: string, postId?: string): PushPayload {
  return {
    title: 'Geekore',
    body: `@${senderUsername} ha commentato`,
    url: postId ? `/feed` : `/notifications`,
    tag: `comment-${postId || 'profile'}`,
  }
}