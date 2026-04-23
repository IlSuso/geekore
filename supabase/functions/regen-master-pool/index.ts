// Versione temporanea — non fa nulla, solo marca i job come done
// per fermare il loop di invalidazione mentre riscriviamo la logica

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const cronHeader = req.headers.get('X-Cron-Secret') || ''
  const body = await req.json().catch(() => ({}))
  if (body?.source !== 'cron' && cronHeader !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Marca tutti i job pending come done senza fare nulla
  // versione temporanea per fermare il loop
  const { data: jobs } = await supabase
    .from('regen_jobs')
    .select('id')
    .eq('status', 'pending')

  if (jobs?.length) {
    await supabase
      .from('regen_jobs')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .in('id', jobs.map((j: any) => j.id))
  }

  return new Response(JSON.stringify({ processed: jobs?.length || 0 }), {
    headers: { 'Content-Type': 'application/json' }
  })
})