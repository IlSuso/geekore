// supabase/functions/regen-master-pool/index.ts
// Strategia: invalida il master pool per l'utente.
// Alla prossima visita alla pagina Per Te, la route rigenera tutto
// (incluso boardgame) in foreground con la logica completa già esistente.
// Questo è il metodo più affidabile: zero dipendenze da chiamate HTTP a Vercel.

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

  const { data: jobs, error: jobsError } = await supabase
    .from('regen_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5)

  if (jobsError || !jobs?.length) {
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
      // Invalida il master pool: azzera generated_at su tutte le righe dell'utente
      // e cancella la riga boardgame se assente (verrà ricreata alla prossima visita).
      // La route /api/recommendations rigenera tutto in foreground alla prossima richiesta.
      const { error: updateError } = await supabase
        .from('master_recommendations_pool')
        .update({ generated_at: new Date(0).toISOString(), collection_size: -1 })
        .eq('user_id', job.user_id)

      if (updateError) throw new Error(updateError.message)

      console.log(`Invalidated pool for user ${job.user_id}`)

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