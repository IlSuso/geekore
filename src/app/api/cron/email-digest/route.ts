// DESTINAZIONE: src/app/api/cron/email-digest/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// Email digest settimanale — Feature #24
//
// Usa Resend (https://resend.com) per inviare email.
// Installa: npm install resend
//
// Variabili .env.local necessarie:
//   RESEND_API_KEY=re_...
//   RESEND_FROM=digest@geekore.it   (dominio verificato su Resend)
//   CRON_SECRET=un-segreto-lungo    (protezione endpoint da accessi non autorizzati)
//
// Configurazione su Vercel (vercel.json):
//   {
//     "crons": [{ "path": "/api/cron/email-digest", "schedule": "0 9 * * 1" }]
//   }
// Ogni lunedì alle 9:00 UTC.
//
// L'utente può disattivare il digest dalla pagina /settings (toggle da aggiungere).
// Legge la preferenza da user_preferences.digest_enabled (bool, default true).
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// ── Resend client (lazy-init per evitare crash senza API key) ─────────────────
async function getResend() {
  const { Resend } = await import('resend')
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY non configurata')
  return new Resend(key)
}

// ── Sicurezza endpoint ────────────────────────────────────────────────────────
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

// ── Template HTML ─────────────────────────────────────────────────────────────
function buildDigestHtml(params: {
  displayName: string
  topGenres: string[]
  completedCount: number
  completedTitles: Array<{ title: string; type: string }>
  trendingInTaste: Array<{ title: string; type: string; score: number }>
  friendsActivity: Array<{ username: string; title: string; type: string }>
  unsubscribeUrl: string
}): string {
  const { displayName, topGenres, completedCount, completedTitles, trendingInTaste, friendsActivity, unsubscribeUrl } = params

  const typeEmoji: Record<string, string> = { anime: '📺', manga: '📚', game: '🎮', movie: '🎬', tv: '📡' }

  const completedSection = completedTitles.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="color:#a78bfa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">
        ✅ Questa settimana hai completato
      </h3>
      ${completedTitles.slice(0, 5).map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#18181b;border-radius:12px;margin-bottom:8px;">
          <span style="font-size:18px;">${typeEmoji[t.type] || '📌'}</span>
          <span style="color:#e4e4e7;font-size:14px;font-weight:600;">${t.title}</span>
        </div>
      `).join('')}
    </div>
  ` : ''

  const trendingSection = trendingInTaste.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="color:#a78bfa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">
        🔥 In tendenza nei tuoi generi
      </h3>
      ${trendingInTaste.slice(0, 4).map(t => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#18181b;border-radius:12px;margin-bottom:8px;">
          <span style="font-size:18px;">${typeEmoji[t.type] || '📌'}</span>
          <span style="color:#e4e4e7;font-size:14px;font-weight:600;">${t.title}</span>
          <span style="color:#71717a;font-size:12px;margin-left:auto;">★ ${t.score.toFixed(1)}</span>
        </div>
      `).join('')}
    </div>
  ` : ''

  const friendsSection = friendsActivity.length > 0 ? `
    <div style="margin-bottom:24px;">
      <h3 style="color:#a78bfa;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">
        👥 I tuoi amici stanno guardando
      </h3>
      ${friendsActivity.slice(0, 4).map(f => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#18181b;border-radius:12px;margin-bottom:8px;">
          <span style="color:#a78bfa;font-size:13px;font-weight:700;">@${f.username}</span>
          <span style="color:#52525b;font-size:13px;">sta guardando</span>
          <span style="color:#e4e4e7;font-size:13px;font-weight:600;">${f.title}</span>
        </div>
      `).join('')}
    </div>
  ` : ''

  return `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#7c3aed,#a855f7);padding:8px 20px;border-radius:999px;margin-bottom:16px;">
        <span style="color:white;font-size:20px;font-weight:900;letter-spacing:-0.5px;">Geekore</span>
      </div>
      <h1 style="color:#f4f4f5;font-size:22px;font-weight:800;margin:0 0 6px;">Ciao, ${displayName}!</h1>
      <p style="color:#71717a;font-size:14px;margin:0;">Il tuo digest settimanale geek</p>
    </div>

    <!-- Generi top -->
    ${topGenres.length > 0 ? `
    <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;padding:16px;margin-bottom:24px;">
      <p style="color:#71717a;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 10px;">I tuoi gusti dominanti</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${topGenres.slice(0, 5).map(g => `
          <span style="background:rgba(124,58,237,0.15);color:#a78bfa;border:1px solid rgba(124,58,237,0.3);padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;">${g}</span>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Completati -->
    ${completedSection}

    <!-- Trending -->
    ${trendingSection}

    <!-- Amici -->
    ${friendsSection}

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0;">
      <a href="https://geekore.it/for-you" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;font-size:14px;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;">
        Scopri i consigli di questa settimana →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;border-top:1px solid #27272a;padding-top:24px;">
      <p style="color:#52525b;font-size:11px;margin:0 0 8px;">
        Ricevi questa email perché hai abilitato il digest settimanale.
      </p>
      <a href="${unsubscribeUrl}" style="color:#71717a;font-size:11px;">Disiscriviti</a>
    </div>

  </div>
</body>
</html>
  `.trim()
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const supabase = await createClient()
  let resend: any
  try {
    resend = await getResend()
  } catch {
    return NextResponse.json({ skipped: true, reason: 'RESEND_API_KEY non configurata' }, { status: 200 })
  }

  const from = process.env.RESEND_FROM || 'digest@geekore.it'
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Leggi tutti gli utenti che hanno il digest abilitato
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('user_id, digest_enabled, fav_anime_genres, fav_game_genres, fav_movie_genres, fav_manga_genres, fav_tv_genres')
    .neq('digest_enabled', false) // null = default true, false = disabilitato

  if (!prefs?.length) {
    return NextResponse.json({ sent: 0, message: 'Nessun utente con digest abilitato' })
  }

  let sent = 0
  let errors = 0

  for (const pref of prefs) {
    try {
      // Dati utente
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('id', pref.user_id)
        .single()

      const { data: authUser } = await supabase.auth.admin.getUserById(pref.user_id)
      const email = authUser?.user?.email
      if (!email || !profile) continue

      // Titoli completati nell'ultima settimana
      const { data: completed } = await supabase
        .from('user_media_entries')
        .select('title, type')
        .eq('user_id', pref.user_id)
        .eq('status', 'completed')
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(5)

      // Generi preferiti dell'utente
      const topGenres = [
        ...(pref.fav_anime_genres || []),
        ...(pref.fav_game_genres || []),
        ...(pref.fav_movie_genres || []),
      ].slice(0, 5)

      // Attività degli amici nell'ultima settimana
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', pref.user_id)
        .limit(20)

      const friendIds = (follows || []).map(f => f.following_id)
      let friendsActivity: Array<{ username: string; title: string; type: string }> = []

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
            .select('id, username')
            .in('id', friendIds)

          const profileMap = Object.fromEntries((friendProfiles || []).map(p => [p.id, p.username]))
          const seen = new Set<string>()
          for (const e of friendEntries) {
            const key = `${e.user_id}-${e.title}`
            if (!seen.has(key) && profileMap[e.user_id]) {
              seen.add(key)
              friendsActivity.push({ username: profileMap[e.user_id], title: e.title, type: e.type })
            }
          }
        }
      }

      // Trending semplice: top titoli per voto tra tutti gli utenti nell'ultima settimana
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

      const unsubscribeUrl = `https://geekore.it/settings?digest=off&uid=${pref.user_id}`

      const html = buildDigestHtml({
        displayName: profile.display_name || profile.username,
        topGenres,
        completedCount: completed?.length || 0,
        completedTitles: completed || [],
        trendingInTaste,
        friendsActivity,
        unsubscribeUrl,
      })

      await resend.emails.send({
        from,
        to: email,
        subject: `🎮 Il tuo digest Geekore — ${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`,
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
