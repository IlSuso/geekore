// src/lib/supabase/client.ts
// Unico client browser da usare in tutti i componenti client.
// Usa createBrowserClient (@supabase/ssr) → salva sessione nei cookie,
// visibile al server. NON usare più src/lib/supabase.ts direttamente.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}