'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react'

function EmailChangeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const confirm = async () => {
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      const code = searchParams.get('code')

      // Caso 1: PKCE flow con code
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          setStatus('success')
          setTimeout(() => router.push('/profile/me'), 2500)
          return
        }
        setErrorMessage('Il link è scaduto o già stato usato.')
        setStatus('error')
        return
      }

      // Caso 2: token_hash (email_change type)
      if (!token_hash) {
        setErrorMessage('Link non valido.')
        setStatus('error')
        return
      }

      const finalType = type && type.trim() !== '' ? type : 'email_change'

      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: finalType as 'email_change' | 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email',
      })

      if (error) {
        setErrorMessage('Il link è scaduto o già stato usato. Riprova dal pannello impostazioni.')
        setStatus('error')
        return
      }

      setStatus('success')
      setTimeout(() => router.push('/profile/me'), 2500)
    }

    confirm()
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-white px-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">

        {status === 'loading' && (
          <>
            <Loader2 size={56} className="mx-auto mb-6 animate-spin" style={{ color: 'var(--accent)' }} />
            <h1 className="text-2xl font-bold mb-2">Conferma in corso...</h1>
            <p className="text-zinc-400">Stiamo verificando il cambio email.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Mail size={32} className="text-emerald-400" />
            </div>
            <CheckCircle size={56} className="mx-auto mb-6 text-emerald-400" />
            <h1 className="text-2xl font-bold mb-2">Email aggiornata!</h1>
            <p className="text-zinc-400">Il tuo indirizzo email è stato cambiato con successo. Ti stiamo portando al profilo...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={56} className="mx-auto mb-6 text-red-400" />
            <h1 className="text-2xl font-bold mb-2">Problema con il link</h1>
            <p className="text-zinc-400 mb-8">{errorMessage}</p>
            <div className="flex flex-col gap-3">
              <a
                href="/settings/profile"
                className="w-full py-3 rounded-2xl font-semibold transition"
                style={{ background: 'var(--accent)', color: '#0B0B0F' }}
              >
                Torna alle impostazioni
              </a>
              <a
                href="/login"
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
              >
                Vai al login
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function EmailChangePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    }>
      <EmailChangeContent />
    </Suspense>
  )
}