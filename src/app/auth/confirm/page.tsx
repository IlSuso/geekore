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
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      const code = searchParams.get('code')
      const emailParam = searchParams.get('email')
      if (emailParam) setResendEmail(decodeURIComponent(emailParam))

      // Effettua sempre il logout prima di verificare il token,
      // così il redirect finale alla pagina di login è sempre pulito
      // (se era loggato con un altro account, viene disconnesso)
      await supabase.auth.signOut()
      document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'

      if (token_hash) {
        const finalType = (type && type.trim() !== '') ? type : 'signup'

        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: finalType as any,
        })

        if (!error) {
          // Rimuovi immediatamente la sessione appena creata dalla verifica OTP:
          // l'utente deve fare login manualmente dopo la conferma
          await supabase.auth.signOut()
          document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
          setStatus('success')
          setTimeout(() => router.push('/login'), 2500)
          return
        }

        setErrorMessage(
          'Il link di conferma è scaduto o è già stato utilizzato.\n\n' +
          'Questo succede spesso quando si apre il link dall\'app Gmail, Outlook o da un WebView.'
        )
        setStatus('error')
        return
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          await supabase.auth.signOut()
          document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
          setStatus('success')
          setTimeout(() => router.push('/login'), 2500)
          return
        }
      }

      setErrorMessage('Link non valido o mancante. Prova a registrarti di nuovo.')
      setStatus('error')
    }

    confirm()
  }, [searchParams, router, supabase])

  const handleResend = async () => {
    if (!resendEmail) return
    setResendStatus('sending')

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: resendEmail,
      options: {
        emailRedirectTo: `https://geekore.it/auth/confirm?email=${encodeURIComponent(resendEmail)}`
      }
    })

    setResendStatus(error ? 'error' : 'sent')
  }

  const handleOpenInBrowser = () => {
    const fullUrl = window.location.href
    window.open(fullUrl, '_system')
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white px-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-10 text-center">
        {status === 'loading' && (
          <>
            <Loader2 size={56} className="mx-auto mb-6 animate-spin" style={{ color: 'var(--accent)' }} />
            <h1 className="text-2xl font-bold mb-2">Conferma in corso...</h1>
            <p className="text-zinc-400">Stiamo verificando il tuo account.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={56} className="mx-auto mb-6 text-emerald-400" />
            <h1 className="text-2xl font-bold mb-2">Email confermata!</h1>
            <p className="text-zinc-400">Account attivato. Tra poco ti portiamo al login…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={56} className="mx-auto mb-6 text-red-400" />
            <h1 className="text-2xl font-bold mb-2">Problema con il link</h1>

            <p className="text-zinc-400 mb-6 whitespace-pre-line">{errorMessage}</p>

            <div className="flex flex-col gap-3">
              {resendEmail ? (
                resendStatus === 'sent' ? (
                  <div className="py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-sm font-medium">
                    ✓ Nuova email di conferma inviata a {resendEmail}
                  </div>
                ) : (
                  <button
                    onClick={handleResend}
                    disabled={resendStatus === 'sending'}
                    className="w-full py-3 disabled:opacity-50 rounded-2xl font-semibold transition flex items-center justify-center gap-2"
                    style={{ background: '#E6FF3D', color: '#0B0B0F' }}
                  >
                    {resendStatus === 'sending' ? (
                      <><Loader2 size={16} className="animate-spin" /> Invio in corso...</>
                    ) : (
                      <><RefreshCw size={16} /> Invia un nuovo link di conferma</>
                    )}
                  </button>
                )
              ) : (
                <a
                  href="/register"
                  className="w-full py-3 rounded-2xl font-semibold transition"
                  style={{ background: '#E6FF3D', color: '#0B0B0F' }}
                >
                  Registrati di nuovo
                </a>
              )}

              <button
                onClick={handleOpenInBrowser}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition text-sm"
              >
                Apri questo link nel browser
              </button>

              <a
                href="/login"
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition text-sm"
              >
                Ho già un account — accedi
              </a>
            </div>

            {resendStatus === 'error' && (
              <p className="text-red-400 text-xs mt-2">Errore nell'invio. Riprova tra qualche secondo.</p>
            )}
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
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  )
}