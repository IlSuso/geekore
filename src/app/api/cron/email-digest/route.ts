// DESTINAZIONE: src/app/api/cron/email-digest/route.ts
// Email digest settimanale — Feature #24

import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { normalizeLocale, type Locale } from '@/lib/i18n/serverLocale'
import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'

export const maxDuration = 60

async function getResend() {
  const { Resend } = await import('resend')
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY non configurata')
  return new Resend(key)
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const authHeader = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-cron-secret')
  return authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const DIGEST_COPY: Record<Locale, {
  completed: string
  trending: string
  friends: string
  isWatching: string
  hello: (name: string) => string
  subtitle: string
  topTastes: string
  cta: string
  footer: string
  unsubscribe: string
  subject: (date: string) => string
}> = {
  it: {
    completed: '✅ Questa settimana hai completato',
    trending: '🔥 In tendenza nei tuoi generi',
    friends: '👥 I tuoi amici stanno guardando',
    isWatching: 'sta guardando',
    hello: name => `Ciao, ${name}!`,
    subtitle: 'Il tuo digest settimanale geek',
    topTastes: 'I tuoi gusti dominanti',
    cta: 'Scopri i consigli di questa settimana →',
    footer: 'Ricevi questa email perché hai abilitato il digest settimanale.',
    unsubscribe: 'Disiscriviti',
    subject: date => `🎮 Il tuo digest Geekore — ${date}`,
  },
  en: {
    completed: '✅ You completed this week',
    trending: '🔥 Trending in your genres',
    friends: '👥 Your friends are watching',
    isWatching: 'is watching',
    hello: name => `Hi, ${name}!`,
    subtitle: 'Your weekly geek digest',
    topTastes: 'Your dominant tastes',
    cta: 'Discover this week’s recommendations →',
    footer: 'You are receiving this email because you enabled the weekly digest.',
    unsubscribe: 'Unsubscribe',
    subject: date => `🎮 Your Geekore digest — ${date}`,
  },
}

function buildDigestHtml(params: {
  displayName: string
  topGenres: string[]
  completedCount: number
  completedTitles: Array<{ title: string; type: string }>
  trendingInTaste: Array<{ title: string; type: string; score: number }>
  friendsActivity: Array<{ username: string; displayName?: string | null; title: string; type: string }>
  unsubscribeUrl: string
  locale: Locale
}): string {
  const { displayName, topGenres, completedTitles, trendingInTaste, friendsActivity, unsubscribeUrl, locale } = params
  const copy = DIGEST_COPY[locale] || DIGEST_COPY.it
  const typeEmoji: Record<string, string> = { anime: '📺', manga: '📚', game: '🎮', movie: '🎬', tv: '📡' }

  const completedSection = completedTitles.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="color:#a78bfa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">
        ${copy.completed}
      </h3>
      ${completedTitles.slice(0, 5).map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#18181b;border-radius:12px;margin-bottom:8px;">
          <span style="font-size:18px;">${typeEmoji[t.type] || '📌'}</span>
          <span style="color:#e4e4e7;font-size:14px;font-weight:600;">${escapeHtml(t.title)}</span>
        </div>
      `).join('')}
    </div>
  ` : ''

  const trendingSection = trendingInTaste.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="color:#a78bfa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">
        ${copy.trending}
      </h3>
      ${trendingInTaste.slice(0, 4).map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#18181b;border-radius:12px;margin-bottom:8px;">
          <span style="font-size:18px;">${typeEmoji[t.type] || '📌'}</span>
          <span style="color:#e4e4e7;font-size:14px;font-weight:600;">${escapeHtml(t.title)}</span>
          <span style="color:#71717a;font-size:12px;margin-left:auto;">★ ${Number(t.score || 0).toFixed(1)}</span>
        </div>
      `).join('')}
    </div>
  ` : ''

  const friendsSection = friendsActivity.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="color:#a78bfa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">
        ${copy.friends}
      </h3>
      ${friendsActivity.slice(0, 4).map(f => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#18181b;border-radius:12px;margin-bottom:8px;">
          <span style="color:#a78bfa;font-size:13px;font-weight:700;">${escapeHtml(f.displayName || f.username)}</span>
          <span style="color:#52525b;font-size:13px;">${copy.isWatching}</span>
          <span style="color:#e4e4e7;font-size:13px;font-weight:600;">${escapeHtml(f.title)}</span>
        </div>
      `).join('')}
    </div>
  ` : ''

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-flex;align-items:center;gap:8px;background:#E6FF3D;padding:8px 20px;border-radius:999px;margin-bottom:16px;">
        <span style="color:#0B0B0F;font-size:20px;font-weight:900;letter-spacing:-0.5px;">Geekore</span>
      </div>
      <h1 style="color:#f4f4f5;font-size:22px;font-weight:800;margin:0 0 6px;">${copy.hello(escapeHtml(displayName))}</h1>
      <p style="color:#71717a;font-size:14px;margin:0;">${copy.subtitle}</p>
    </div>

    ${topGenres.length > 0 ? `
    <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:16px;margin-bottom:24px;">
      <p style="color:#71717a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 10px;">${copy.topTastes}</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${topGenres.slice(0, 5).map(g => `
          <span style="background:rgba(230,255,61,0.12);color:#E6FF3D;border:1px solid rgba(230,255,61,0.25);padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">${escapeHtml(g)}</span>
        `).join('')}
      </div>
    </div>
    ` : ''}

    ${completedSection}
    ${trendingSection}
    ${friendsSection}

    <div style="text-align:center;margin:32px 0;">
      <a href="https://geekore.it/for-you" style="display:inline-block;background:#E6FF3D;color:#0B0B0F;font-size:14px;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;">
        ${copy.cta}
      </a>
    </div>

    <div style="text-align:center;border-top:1px solid #27272a;padding-top:24px;">
      <p style="color:#52525b;font-size:11px;margin:0 0 8px;">
        ${copy.footer}
      </p>
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#71717a;font-size:11px;">${copy.unsubscribe}</a>
    </div>
  </div>
</body>
</html>
  `.trim()
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: apiMessage(request, 'cronSecretMissing') }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: apiMessage(request, 'unauthorized') }, { status: 401 })
  }

  const supabase = createServiceClient('cron:email-digest')
  let resend: any
  try {
    resend = await getResend()
  } catch {
    return NextResponse.json({ skipped: true, reason: apiMessage(request, 'resendKeyMissing') }, { status: 200 })
  }

  const from = process.env.RESEND_FROM || 'digest@geekore.it'
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('user_id, digest_enabled, fav_anime_genres, fav_game_genres, fav_movie_genres, fav_manga_genres, fav_tv_genres')
    .neq('digest_enabled', false)

  if (!prefs?.length) {
    return NextResponse.json({ sent: 0, message: apiMessage(request, 'noDigestUsers') })
  }

  let sent = 0
  let errors = 0

  for (const pref of prefs.slice(0, 100)) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, preferred_locale')
        .eq('id', pref.user_id)
        .single()

      const { data: authUser } = await supabase.auth.admin.getUserById(pref.user_id)
      const email = authUser?.user?.email
      if (!email || !profile) continue

      const { data: completed } = await supabase
        .from('user_media_entries')
        .select('title, type')
        .eq('user_id', pref.user_id)
        .eq('status', 'completed')
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(5)

      const topGenres = [
        ...(pref.fav_anime_genres || []),
        ...(pref.fav_game_genres || []),
        ...(pref.fav_movie_genres || []),
      ].slice(0, 5)

      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', pref.user_id)
        .limit(20)

      const friendIds = (follows || []).map(f => f.following_id)
      let friendsActivity: Array<{ username: string; displayName?: string | null; title: string; type: string }> = []

      if (friendIds.length > 0) {
        const { data: friendEntries } = await supabase
          .from('user_media_entries')
          .select('user_id, title, type')
          .in('user_id', friendIds)
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(10)

        if (friendEntries?.length) {
          const { data: friendProfiles } = await supabase
            .from('profiles')
            .select('id, username, display_name')
            .in('id', friendIds)

          const profileMap = Object.fromEntries((friendProfiles || []).map(p => [p.id, { username: p.username, displayName: p.display_name }]))
          const seen = new Set<string>()
          for (const e of friendEntries) {
            const key = `${e.user_id}-${e.title}`
            if (!seen.has(key) && profileMap[e.user_id]) {
              seen.add(key)
              const friend = profileMap[e.user_id]
              friendsActivity.push({ username: friend.username, displayName: friend.displayName, title: e.title, type: e.type })
            }
          }
        }
      }

      const { data: trending } = await supabase
        .from('user_media_entries')
        .select('title, type, rating')
        .gte('updated_at', since)
        .gte('rating', 4)
        .not('user_id', 'eq', pref.user_id)
        .order('rating', { ascending: false })
        .limit(20)

      const trendingMap: Record<string, { title: string; type: string; score: number; count: number }> = {}
      for (const t of trending || []) {
        if (!trendingMap[t.title]) trendingMap[t.title] = { title: t.title, type: t.type, score: 0, count: 0 }
        trendingMap[t.title].score += t.rating
        trendingMap[t.title].count += 1
      }
      const trendingInTaste = Object.values(trendingMap)
        .map(t => ({ ...t, score: t.score / t.count }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)

      const unsubscribeUrl = `https://geekore.it/settings?digest=off&uid=${encodeURIComponent(pref.user_id)}`

      const userLocale = normalizeLocale(profile.preferred_locale) || 'it'

      const html = buildDigestHtml({
        displayName: profile.display_name || profile.username,
        topGenres,
        completedCount: completed?.length || 0,
        completedTitles: completed || [],
        trendingInTaste,
        friendsActivity,
        unsubscribeUrl,
        locale: userLocale,
      })

      await resend.emails.send({
        from,
        to: email,
        subject: DIGEST_COPY[userLocale].subject(new Date().toLocaleDateString(userLocale === 'it' ? 'it-IT' : 'en-US', { day: 'numeric', month: 'long' })),
        html,
      })

      sent++
    } catch (err) {
      logger.error('Digest', 'Errore invio digest utente', err)
      errors++
    }
  }

  return NextResponse.json({ sent, errors, total: prefs.length })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
