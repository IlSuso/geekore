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

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Durante il build statico le env var possono essere assenti.
    return createBrowserClient('https://placeholder.supabase.co', 'placeholder-key')
  }
  return createBrowserClient(url, key, {
    auth: {
      flowType: 'implicit',  // token_hash invece di PKCE — compatibile con WebView Gmail/Outlook
    },
  })
}