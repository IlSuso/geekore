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

// Quanto tempo deve passare prima di inviare un'altra push dello stesso tipo
// sullo stesso contesto (post, profilo, ecc.)
const RATE_LIMIT_MINUTES: Record<string, number> = {
  like:            15,
  comment:         10,
  follow:           5,
  'profile-comment': 10,
}

/**
 * Controlla il rate limit e aggiorna il timestamp.
 * Ritorna true se la push PUÒ essere inviata, false se è troppo presto.
 * context_id: post_id per like/commenti, sender_id per follow, profile_id per bacheca
 */
async function checkAndUpdateRateLimit(
  userId: string,
  type: string,
  contextId: string | null
): Promise<boolean> {
  const supabase = createServiceClient()
  const windowMinutes = RATE_LIMIT_MINUTES[type] ?? 10
  const windowMs = windowMinutes * 60 * 1000

  const { data: existing } = await supabase
    .from('push_rate_limit')
    .select('id, last_sent_at')
    .eq('user_id', userId)
    .eq('type', type)
    .is(contextId ? 'context_id' : 'context_id', contextId)
    .maybeSingle()

  const now = Date.now()

  if (existing) {
    const lastSent = new Date(existing.last_sent_at).getTime()
    if (now - lastSent < windowMs) {
      // Troppo presto — non inviare
      return false
    }
    // Aggiorna il timestamp
    await supabase
      .from('push_rate_limit')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    // Prima push di questo tipo per questo contesto — inserisci e invia
    await supabase
      .from('push_rate_limit')
      .insert({ user_id: userId, type, context_id: contextId, last_sent_at: new Date().toISOString() })
  }

  return true
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  type?: string,
  contextId?: string | null
): Promise<void> {
  const tag = `[Push:${payload.tag || 'notif'}]`

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error(`${tag} ❌ VAPID keys mancanti sul server`)
    return
  }

  // Rate limit: se type è fornito, controlla prima di inviare
  if (type) {
    const canSend = await checkAndUpdateRateLimit(userId, type, contextId ?? null)
    if (!canSend) {
      console.log(`${tag} ⏳ Rate limit attivo per user ${userId} type=${type} context=${contextId} — push soppressa`)
      return
    }
  }

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
    url: `/home`,
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