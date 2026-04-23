// supabase/functions/regen-master-pool/index.ts
// Edge Function che processa i job di rigenerazione del master pool.
// Chiamata da pg_cron ogni minuto se ci sono job pending.
// Gira sui server Supabase — indipendente dal client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL')!  // es. https://geekore.it
const CRON_SECRET = Deno.env.get('CRON_SECRET')!  // secret condiviso per autenticare le chiamate

Deno.serve(async (req: Request) => {
  // Accetta solo POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Verifica autorizzazione — accetta sia cron interno che chiamate con secret
  const authHeader = req.headers.get('Authorization') || ''
  const body = await req.json().catch(() => ({}))
  const isFromCron = body?.source === 'cron'
  const hasSecret = authHeader === `Bearer ${CRON_SECRET}`

  if (!isFromCron && !hasSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Prendi fino a 3 job pending (per non sovraccaricare se ci sono molti utenti)
  const { data: jobs, error: jobsError } = await supabase
    .from('regen_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(3)

  if (jobsError || !jobs?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let processed = 0

  for (const job of jobs) {
    // Marca come running
    await supabase
      .from('regen_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job.id)

    try {
      // Ottieni un JWT valido per l'utente tramite service role
      // (serve per chiamare /api/recommendations che usa createClient con cookies)
      // Usiamo invece una chiamata diretta con il service role che bypassa auth
      const mediaTypes = job.media_types || ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']

      // Chiama l'endpoint interno con service key + user_id come header custom
      const regenUrl = `${APP_URL}/api/recommendations/background-regen`
      const res = await fetch(regenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cron-Secret': CRON_SECRET,
        },
        body: JSON.stringify({
          user_id: job.user_id,
          media_types: mediaTypes,
          force_refresh: job.force_refresh ?? true,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`HTTP ${res.status}: ${errText}`)
      }

      // Marca come done
      await supabase
        .from('regen_jobs')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', job.id)

      processed++
    } catch (err: any) {
      // Marca come error — non riprova automaticamente (evita loop)
      await supabase
        .from('regen_jobs')
        .update({
          status: 'error',
          completed_at: new Date().toISOString(),
          error_msg: err?.message || 'unknown error',
        })
        .eq('id', job.id)
    }
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' }
  })
})