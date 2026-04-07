// src/lib/supabase/client.ts
// Unico client browser da usare in tutti i componenti client.
// Usa createBrowserClient (@supabase/ssr) → salva sessione nei cookie,
// visibile al server. NON usare più src/lib/supabase.ts direttamente.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Durante il build statico le env var possono essere assenti.
    // Restituiamo un client con valori placeholder — non verrà usato
    // perché i componenti client non eseguono chiamate nel server pre-render.
    return createBrowserClient('https://placeholder.supabase.co', 'placeholder-key')
  }
  return createBrowserClient(url, key)
}