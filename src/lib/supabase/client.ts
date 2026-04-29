// src/lib/supabase/client.ts
// Unico client browser da usare in tutti i componenti client.
// Usa createBrowserClient (@supabase/ssr) → salva sessione nei cookie,
// visibile al server. NON usare più src/lib/supabase.ts direttamente.
//
// IMPORTANTE: flowType 'pkce' (default) richiede che il code_verifier
// sia nello stesso localStorage del browser che ha fatto la registrazione.
// Questo rompe il flow quando Gmail (e altre app email) aprono i link
// nella propria WebView interna invece del browser di sistema.
// Con flowType: 'implicit', Supabase usa token_hash invece di PKCE —
// funziona da qualsiasi contesto senza dipendenze da localStorage.
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton: una sola istanza per tutta l'app browser.
// Evita che ogni createClient() crei un nuovo oggetto, causando
// re-esecuzione degli useEffect con [supabase] nelle dipendenze
// e il conseguente errore "cannot add postgres_changes after subscribe()".
let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Durante il build statico le env var possono essere assenti.
    _client = createBrowserClient('https://placeholder.supabase.co', 'placeholder-key')
    return _client
  }
  _client = createBrowserClient(url, key, {
    auth: {
      flowType: 'implicit',  // token_hash invece di PKCE — compatibile con WebView Gmail/Outlook
    },
  })
  return _client
}