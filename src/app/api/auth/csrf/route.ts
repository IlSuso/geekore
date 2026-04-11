// src/app/api/auth/csrf/route.ts
// Restituisce il CSRF token per la sessione corrente.
// Il client lo legge una volta e lo allega come X-CSRF-Token header
// sulle mutation critiche (DELETE account, PATCH profilo).

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateCsrfToken } from '@/lib/csrf'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ token: null }, { status: 401 })
    }

    const token = generateCsrfToken(user.id)
    return NextResponse.json({ token }, {
      headers: {
        // Non cachare — il token cambia ogni giorno
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch {
    return NextResponse.json({ token: null }, { status: 500 })
  }
}