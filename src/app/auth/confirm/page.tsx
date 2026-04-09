'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

function ConfirmContent() {
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const confirm = async () => {
      // Caso 1: sessione già attiva (ricaricamento pagina)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setStatus('success')
        const { data: profile } = await supabase
          .from('profiles').select('username').eq('id', session.user.id).single()
        setTimeout(() => {
          router.push(profile?.username ? `/profile/${profile.username}` : '/feed')
        }, 1500)
        return
      }

      // Leggi i parametri dall'hash (#) — Brevo non visita gli URL con fragment
      // quindi il token arriva intatto al browser dell'utente
      const hash = window.location.hash.substring(1) // rimuove il #
      const params = new URLSearchParams(hash)
      const token_hash = params.get('token_hash')
      const type = params.get('type')

      // Fallback: controlla anche query string (per compatibilità con link vecchi)
      const searchParams = new URLSearchParams(window.location.search)
      const qs_token = searchParams.get('token_hash')
      const qs_type = searchParams.get('type')
      const qs_code = searchParams.get('code')

      const finalToken = token_hash || qs_token
      const finalType = type || qs_type

      // Caso 2: PKCE flow (code)
      if (qs_code) {
        const { error } = await supabase.auth.exchangeCodeForSession(qs_code)
        if (!error) {
          const { data: { session: s } } = await supabase.auth.getSession()
          if (s?.user) {
            setStatus('success')
            const { data: profile } = await supabase
              .from('profiles').select('username').eq('id', s.user.id).single()
            setTimeout(() => {
              router.push(profile?.username ? `/profile/${profile.username}` : '/feed')
            }, 1500)
            return
          }
        }
      }

      if (!finalToken || !finalType) {
        setErrorMessage('Link non valido. Riprova la registrazione.')
        setStatus('error')
        return
      }

      // Caso 3: token_hash flow
      const { error } = await supabase.auth.verifyOtp({
        token_hash: finalToken,
        type: finalType as any,
      })

      if (error) {
        setErrorMessage('Il link è scaduto o già stato usato. Prova ad accedere direttamente.')
        setStatus('error')
        return
      }

      setStatus('success')
      const { data: { session: newSession } } = await supabase.auth.getSession()
      if (newSession?.user) {
        const { data: profile } = await supabase
          .from('profiles').select('username').eq('id', newSession.user.id).single()
        setTimeout(() => {
          router.push(profile?.username ? `/profile/${profile.username}` : '/feed')
        }, 1500)
      } else {
        setTimeout(() => router.push('/feed'), 1500)
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
            <h1 className="text-2xl font-bold mb-2">Problema con il link</h1>
            <p className="text-zinc-400 mb-8">{errorMessage}</p>
            <div className="flex flex-col gap-3">
              <a href="/login" className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition">
                Prova ad accedere
              </a>
              <a href="/register" className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition">
                Registrati di nuovo
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