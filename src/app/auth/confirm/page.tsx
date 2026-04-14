'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'

function ConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    const confirm = async () => {
      // Se c'è già una sessione attiva, vai direttamente
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setStatus('success')
        await redirectUser(session.user.id)
        return
      }

      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      const code = searchParams.get('code')
      const emailParam = searchParams.get('email')
      if (emailParam) setResendEmail(decodeURIComponent(emailParam))

      // Con flowType: 'implicit', Supabase manda token_hash invece di code.
      // Gestiamo comunque il code come fallback per retrocompatibilità.
      if (token_hash) {
        const finalType = (type && type.trim() !== '') ? type : 'signup'
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: finalType as any,
        })
        if (!error) {
          const { data: { session: s } } = await supabase.auth.getSession()
          setStatus('success')
          if (s?.user) await redirectUser(s.user.id)
          else setTimeout(() => router.push('/feed'), 1500)
          return
        }
        // token_hash fallito → scaduto o già usato
        setErrorMessage('Il link è scaduto o è già stato usato.')
        setStatus('error')
        return
      }

      if (code) {
        // Fallback PKCE — può fallire se aperto in WebView diversa dal browser originale
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          const { data: { session: s } } = await supabase.auth.getSession()
          setStatus('success')
          if (s?.user) await redirectUser(s.user.id)
          else setTimeout(() => router.push('/feed'), 1500)
          return
        }
        // PKCE fallito — quasi certamente WebView diversa dal browser di registrazione
        setErrorMessage('Il link non può essere usato in questa app. Aprilo direttamente in Chrome o Safari.')
        setStatus('error')
        return
      }

      setErrorMessage('Link non valido. Prova a registrarti di nuovo.')
      setStatus('error')
    }

    const redirectUser = async (userId: string) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, onboarding_done')
        .eq('id', userId)
        .single()

      setTimeout(() => {
        if (!profile?.onboarding_done) {
          router.push('/onboarding')
        } else {
          router.push(profile?.username ? `/profile/${profile.username}` : '/feed')
        }
      }, 1500)
    }

    confirm()
  }, [])

  const handleResend = async () => {
    if (!resendEmail) return
    setResendStatus('sending')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: resendEmail,
      options: { emailRedirectTo: `https://geekore.it/auth/confirm?email=${encodeURIComponent(resendEmail)}` }
    })
    setResendStatus(error ? 'error' : 'sent')
  }

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
            <p className="text-zinc-400">Account attivato. Ti stiamo portando...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={56} className="mx-auto mb-6 text-red-400" />
            <h1 className="text-2xl font-bold mb-2">Problema con il link</h1>
            <p className="text-zinc-400 mb-2">{errorMessage}</p>
            <p className="text-zinc-500 text-sm mb-8">
              Se hai aperto il link dall'app Gmail o da un'altra app email,
              prova a copiare il link e aprirlo direttamente in Chrome.
            </p>

            <div className="flex flex-col gap-3">
              {resendEmail ? (
                resendStatus === 'sent' ? (
                  <div className="py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-sm font-medium">
                    ✓ Nuova email inviata a {resendEmail}
                  </div>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={resendStatus === 'sending'}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-2xl font-semibold transition flex items-center justify-center gap-2"
                  >
                    {resendStatus === 'sending'
                      ? <><Loader2 size={16} className="animate-spin" /> Invio in corso...</>
                      : <><RefreshCw size={16} /> Invia un nuovo link</>
                    }
                  </button>
                )
              ) : (
                <a href="/register" className="w-full py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition">
                  Registrati di nuovo
                </a>
              )}
              {resendStatus === 'error' && (
                <p className="text-red-400 text-xs">Errore nell'invio. Riprova tra qualche secondo.</p>
              )}
              <a href="/login" className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition text-sm">
                Ho già un account — accedi
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