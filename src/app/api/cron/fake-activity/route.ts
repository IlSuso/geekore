// src/app/api/cron/fake-activity/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// Cron giornaliero — simula attività naturale degli utenti fake
//
// Configurazione vercel.json (aggiungere al array "crons"):
//   { "path": "/api/cron/fake-activity", "schedule": "0 18 * * *" }
// Ogni giorno alle 18:00 UTC (20:00 ora italiana).
//
// Protezione: richiede l'header Authorization: Bearer <CRON_SECRET>
// (Vercel lo passa automaticamente se configurato nel progetto)
//
// Cosa fa ogni run:
//   - Sceglie 2-4 utenti fake a caso
//   - Ognuno fa 1 azione: post OPPURE like OPPURE commento su post recente
//   - I timestamp sono "ora corrente" (aggiorna il feed in modo naturale)
//   - Mai più di 1 post per fake user per giorno (evita spam)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// UUID fissi degli utenti fake (stessi dello script seed)
const FAKE_USER_IDS = [
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'a1000000-0000-0000-0000-000000000008',
  'a1000000-0000-0000-0000-000000000009',
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000011',
  'a1000000-0000-0000-0000-000000000012',
  'a1000000-0000-0000-0000-000000000013',
  'a1000000-0000-0000-0000-000000000014',
  'a1000000-0000-0000-0000-000000000015',
]

// Post rotativi — pool di contenuti realistici
const POST_POOL = [
  'Sto giocando a {game} da ore e non riesco a smettere. Qualcuno altri in questa situazione?',
  'Finalmente iniziato {anime}. Capisco il hype ora.',
  'Rating aggiornato su {title}: assolutamente da {rating}/10. Non ci sono dubbi.',
  '{title} è sottovalutato. Ne parlano pochissimo rispetto a quanto merita.',
  'Consiglio del giorno: {title}. Se non l\'avete ancora visto/letto/giocato, correte.',
  'Hot take: {title} è meglio di qualsiasi cosa sia uscita nell\'ultimo anno nel genere.',
  'Ore piccole, ancora su {title}. Domani mi odierò ma ne vale la pena.',
  'Capitolo/episodio nuovo di {title} uscito. Settimana salvata.',
  'Maratona {title} questo weekend. Chi è dei miei?',
  'Non pensavo che {title} mi prendesse così tanto. Errore mio.',
  'Update: sono a metà di {title} e la storia sta diventando assurda nel senso migliore.',
  'Ho convinto un amico a iniziare {title}. Speriamo bene per lui.',
]

const TITLES = [
  'Elden Ring', 'Berserk', 'Balatro', 'Shogun', 'Final Fantasy VII Rebirth',
  'Dungeon Meshi', 'Hades II', 'Alan Wake 2', 'Vinland Saga', 'Chainsaw Man',
  'Stardew Valley', 'Dragon\'s Dogma 2', 'Solo Leveling', 'The Bear', 'Fallout',
  'Sekiro', 'Nana', 'Metaphor ReFantazio', 'Frieren', 'Blue Lock',
]

const COMMENT_POOL = [
  'Stesso identico pensiero!',
  'Ci ho messo un po\' ma poi mi ha preso tantissimo.',
  'Concordo al 100%, è una roba fuori scala.',
  'Devo ancora finirlo, non fare spoiler 😅',
  'Anche io stessa reazione al momento X.',
  'Lo stavo pensando anche io ultimamente.',
  'Già messo in lista dopo questo post!',
  'Quanto ci hai messo a finirlo/vederlo?',
  'Troppo forte, uno dei migliori del genere.',
  'Anche io bloccato nello stesso punto!',
  'Mi hai convinto, lo inizio questo weekend.',
  'Hype condiviso al massimo.',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

function buildPostContent(): string {
  const template = pick(POST_POOL)
  const title = pick(TITLES)
  return template
    .replace('{game}', title)
    .replace('{anime}', title)
    .replace('{title}', title)
    .replace('{rating}', String(Math.floor(Math.random() * 3) + 8)) // 8-10
}

export async function GET(request: NextRequest) {
  // Verifica CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Client con service_role per bypassare RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const results: string[] = []

  try {
    // Scegli 2-4 fake users che "agiscono" oggi
    const actingUsers = pickN(FAKE_USER_IDS, 2 + Math.floor(Math.random() * 3))

    // Controlla chi ha già postato oggi (evita duplicati)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data: todayPosts } = await supabase
      .from('posts')
      .select('user_id')
      .in('user_id', FAKE_USER_IDS)
      .gte('created_at', todayStart.toISOString())

    const alreadyPostedToday = new Set((todayPosts || []).map((p: any) => p.user_id))

    // Recupera post recenti (ultimi 7 giorni) per like/commenti
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('id, user_id')
      .gte('created_at', weekAgo)
      .limit(30)

    for (const userId of actingUsers) {
      // Decidi azione: 35% post, 40% like, 25% commento
      const roll = Math.random()
      
      if (roll < 0.35 && !alreadyPostedToday.has(userId)) {
        // POST
        const content = buildPostContent()
        const { error } = await supabase
          .from('posts')
          .insert({ user_id: userId, content })

        if (!error) {
          results.push(`POST da ${userId.slice(-4)}: "${content.slice(0, 50)}..."`)
        }

      } else if (roll < 0.75 && recentPosts && recentPosts.length > 0) {
        // LIKE su post di qualcun altro
        const eligiblePosts = recentPosts.filter((p: any) => p.user_id !== userId)
        if (eligiblePosts.length > 0) {
          const targetPost = pick(eligiblePosts)

          // Controlla se ha già messo like
          const { data: existingLike } = await supabase
            .from('likes')
            .select('id')
            .eq('user_id', userId)
            .eq('post_id', targetPost.id)
            .maybeSingle()

          if (!existingLike) {
            const { error } = await supabase
              .from('likes')
              .insert({ user_id: userId, post_id: targetPost.id })

            if (!error) {
              results.push(`LIKE da ${userId.slice(-4)} su post ${targetPost.id.slice(-4)}`)
            }
          }
        }

      } else if (recentPosts && recentPosts.length > 0) {
        // COMMENTO
        const eligiblePosts = recentPosts.filter((p: any) => p.user_id !== userId)
        if (eligiblePosts.length > 0) {
          const targetPost = pick(eligiblePosts)
          const content = pick(COMMENT_POOL)

          const { error } = await supabase
            .from('comments')
            .insert({ post_id: targetPost.id, user_id: userId, content })

          if (!error) {
            results.push(`COMMENT da ${userId.slice(-4)}: "${content}"`)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      actions: results.length,
      details: results,
    })

  } catch (err) {
    console.error('[FakeActivity Cron]', err)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}