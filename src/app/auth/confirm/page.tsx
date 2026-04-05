// DESTINAZIONE: src/app/auth/confirm/page.tsx

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

function ConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const confirm = async () => {
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (!token_hash || !type) {
        setErrorMessage('Link non valido o scaduto.')
        setStatus('error')
        return
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      })

      if (error) {
        setErrorMessage(error.message || 'Errore durante la conferma.')
        setStatus('error')
        return
      }

      setStatus('success')

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single()

        setTimeout(() => {
          router.push(profile?.username ? `/profile/${profile.username}` : '/profile/me')
        }, 2000)
      }
    }

    confirm()
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white px-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">

        {status === 'loading' && (
          <>
            <Loader2 size={56} className="mx-auto mb-6 text-violet-500 animate-spin" />
            <h1 className="text-2xl font-bold mb-2">Conferma in corso...</h1>
            <p className="text-zinc-400">Stiamo verificando il tuo account.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={56} className="mx-auto mb-6 text-emerald-400" />
            <h1 className="text-2xl font-bold mb-2">Email confermata!</h1>
            <p className="text-zinc-400">Account attivato. Ti stiamo portando al tuo profilo...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={56} className="mx-auto mb-6 text-red-400" />
            <h1 className="text-2xl font-bold mb-2">Link non valido</h1>
            <p className="text-zinc-400 mb-8">{errorMessage}</p>
            <div className="flex flex-col gap-3">
              <a
                href="/register"
                className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition"
              >
                Registrati di nuovo
              </a>
              <a
                href="/login"
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
              >
                Accedi
              </a>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={40} className="text-violet-500 animate-spin" />
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  )
}