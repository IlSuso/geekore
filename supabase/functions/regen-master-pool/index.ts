// supabase/functions/regen-master-pool/index.ts
// Chiamata da pg_cron ogni minuto se ci sono job pending.
// Resetta collection_size a -999 per forzare hasGrown su tutti i tipi
// alla prossima apertura della pagina Per Te.
// NON invalida i dati esistenti — l'utente vede sempre i consigli vecchi
// finché non apre Per Te, dove trova tutto rigenerato.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const cronHeader = req.headers.get('X-Cron-Secret') || ''
  const body = await req.json().catch(() => ({}))
  const isFromCron = body?.source === 'cron'
  const hasSecret = cronHeader === CRON_SECRET

  if (!isFromCron && !hasSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Prendi job pending
  const { data: jobs } = await supabase
    .from('regen_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5)

  if (!jobs?.length) {
    console.log('No pending jobs')
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  console.log(`Processing ${jobs.length} jobs`)
  let processed = 0

  for (const job of jobs) {
    await supabase
      .from('regen_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', job.id)

    try {
      // Setta collection_size = -999 su tutte le righe esistenti dell'utente.
      // Questo fa scattare hasGrown = (entries - (-999)) >= 5 → sempre true.
      // I dati (raccomandazioni) rimangono intatti — l'utente non vede nulla di rotto.
      // Alla prossima apertura di Per Te, la route rigenera tutto incluso boardgame.
      const { error } = await supabase
        .from('master_recommendations_pool')
        .update({ collection_size: -999 })
        .eq('user_id', job.user_id)

      if (error) throw new Error(error.message)

      console.log(`Marked pool for regen: user ${job.user_id}`)

      await supabase
        .from('regen_jobs')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', job.id)

      processed++
    } catch (err: any) {
      console.error(`Job ${job.id} error: ${err?.message}`)
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