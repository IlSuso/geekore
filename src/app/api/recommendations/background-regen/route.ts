// src/app/api/recommendations/background-regen/route.ts
// Chiamata dalla Edge Function Supabase per rigenerare il master pool
// di un utente specifico, senza bisogno della sua sessione.
// Usa SUPABASE_SERVICE_ROLE_KEY per bypassare l'auth.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function POST(request: NextRequest) {
  // Verifica secret
  const secret = request.headers.get('X-Cron-Secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Missing service key' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const { user_id, media_types, force_refresh } = body

  if (!user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }

  // Crea client con service role — può leggere/scrivere per qualunque utente
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Verifica che l'utente esista e abbia abbastanza entry
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, entry_count')
    .eq('id', user_id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Genera un link magico one-time per l'utente così possiamo chiamare
  // la GET /api/recommendations come se fosse lui — il modo più sicuro
  // di riusare tutta la logica esistente senza duplicarla.
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: (await supabase.auth.admin.getUserById(user_id)).data.user?.email || '',
  })

  if (linkError || !linkData?.properties?.access_token) {
    // Fallback: chiama direttamente senza sessione usando il service role
    // In questo caso non possiamo usare la GET esistente (richiede cookies),
    // quindi triggeriamo un refresh via update della tabella che forza
    // il prossimo accesso a rigenerare
    logger.warn('background-regen', `Cannot generate token for ${user_id}, forcing pool invalidation`)

    // Invalida il pool esistente così alla prossima visita viene rigenerato
    await supabase
      .from('recommendations_pool')
      .delete()
      .eq('user_id', user_id)

    // Aggiorna master pool generated_at a NULL per forzare regen
    await supabase
      .from('master_recommendations_pool')
      .update({ generated_at: new Date(0).toISOString() })
      .eq('user_id', user_id)

    return NextResponse.json({ status: 'invalidated', user_id })
  }

  const accessToken = linkData.properties.access_token

  // Chiama la GET /api/recommendations con il token dell'utente
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const types = (media_types || ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']).join(',')
  const refreshParam = force_refresh !== false ? '&refresh=1' : ''
  const url = `${appUrl}/api/recommendations?type=all${refreshParam}&onboarding=1`

  try {
    const res = await fetch(url, {
      headers: {
        // Passa il token come Bearer — la route usa createClient() con cookies,
        // ma accetta anche Authorization header tramite il client Supabase
        'Authorization': `Bearer ${accessToken}`,
        'Cookie': `sb-access-token=${accessToken}`,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      logger.error('background-regen', `Regen failed for ${user_id}: ${res.status} ${text}`)
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 500 })
    }

    logger.info('background-regen', `Master pool regenerated for user ${user_id}`)
    return NextResponse.json({ status: 'done', user_id })
  } catch (err: any) {
    logger.error('background-regen', `Fetch error for ${user_id}: ${err?.message}`)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}