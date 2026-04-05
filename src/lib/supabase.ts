// src/lib/supabase.ts
// Shim di compatibilità — molti componenti importano da qui.
// Usa createBrowserClient (SSR-safe): salva sessione nei cookie,
// non in localStorage, quindi visibile al server.
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)