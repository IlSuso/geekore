// supabase/functions/regen-master-pool/index.ts
// Edge Function chiamata da pg_cron ogni minuto.
// Chiama direttamente /api/recommendations con header service role,
// bypassando il problema delle chiamate self-referenziali di Vercel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL')!
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

  // Prendi fino a 3 job pending
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
      // Chiama direttamente /api/recommendations con X-Service headers
      // La Edge Function può chiamare Vercel senza il problema self-referenziale
      const url = `${APP_URL}/api/recommendations?type=all&refresh=1&onboarding=1`
      const res = await fetch(url, {
        headers: {
          'X-Service-User-Id': job.user_id,
          'X-Service-Secret': CRON_SECRET,
        },
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }

      await supabase
        .from('regen_jobs')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', job.id)

      processed++
    } catch (err: any) {
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