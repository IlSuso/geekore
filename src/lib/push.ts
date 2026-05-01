// src/lib/push.ts

import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'

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
  const supabase = createServiceClient('push:rate-limit')
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
    logger.error(tag, 'VAPID keys mancanti sul server')
    return
  }

  // Rate limit: se type è fornito, controlla prima di inviare
  if (type) {
    const canSend = await checkAndUpdateRateLimit(userId, type, contextId ?? null)
    if (!canSend) {
      logger.info(tag, 'Rate limit attivo, push soppressa', { type })
      return
    }
  }

  const supabase = createServiceClient('push:send-to-user')

  const { data: subscriptions, error: dbError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (dbError) {
    logger.error(tag, 'Errore DB push subscription', { message: dbError.message })
    return
  }

  if (!subscriptions || subscriptions.length === 0) {
    logger.warn(tag, 'Nessuna subscription trovata')
    return
  }

  logger.info(tag, 'Invio push', { devices: subscriptions.length, type })

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
          { TTL: 60 * 60 * 24 }
        )
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          logger.warn(tag, 'Subscription scaduta, verrà rimossa', { statusCode: err.statusCode })
          expiredEndpoints.push(sub.endpoint)
        } else {
          logger.error(tag, 'Errore invio push', { statusCode: err.statusCode, message: err.message })
        }
      }
    })
  )

  if (expiredEndpoints.length > 0) {
    logger.info(tag, 'Rimozione subscription scadute', { count: expiredEndpoints.length })
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
    url: postId ? `/home` : `/notifications`,
    tag: `comment-${postId || 'profile'}`,
  }
}
