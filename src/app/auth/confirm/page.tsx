'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Loader2, MailCheck, RefreshCw, XCircle, Zap } from 'lucide-react'
import { useLocale } from '@/lib/locale'

type Status = 'loading' | 'success' | 'error'
type ResendStatus = 'idle' | 'sending' | 'sent' | 'error'

const confirmCopy = {
  it: {
    expired: 'Il link di conferma è scaduto o è già stato utilizzato. Se lo hai aperto da Gmail, Outlook o da un WebView, prova a richiederne uno nuovo e aprirlo nel browser.',
    missing: 'Link non valido o mancante. Prova a registrarti di nuovo.',
    loadingKicker: 'Conferma account',
    loadingTitle: 'Verifica in corso',
    loadingBody: 'Stiamo controllando il link e preparando il tuo accesso.',
    successKicker: 'Account attivo',
    successTitle: 'Email confermata',
    successBody: 'Perfetto. Tra poco ti riportiamo al login per entrare in Geekore.',
    errorKicker: 'Link non valido',
    errorTitle: 'Problema con il link',
    sentTo: 'Nuova email inviata a',
    resend: 'Invia di nuovo l’email',
    sending: 'Invio in corso...',
    newLink: 'Invia un nuovo link',
    registerAgain: 'Registrati di nuovo',
    backToLogin: 'Torna al login',
    sendError: 'Errore nell’invio. Riprova tra qualche secondo.',
  },
  en: {
    expired: 'The confirmation link has expired or has already been used. If you opened it from Gmail, Outlook, or a WebView, request a new one and open it in your browser.',
    missing: 'Invalid or missing link. Try signing up again.',
    loadingKicker: 'Account confirmation',
    loadingTitle: 'Verifying',
    loadingBody: 'We are checking the link and preparing your access.',
    successKicker: 'Account active',
    successTitle: 'Email confirmed',
    successBody: 'Perfect. We will take you back to login in a moment.',
    errorKicker: 'Invalid link',
    errorTitle: 'Link problem',
    sentTo: 'New email sent to',
    resend: 'Send the email again',
    sending: 'Sending...',
    newLink: 'Send a new link',
    registerAgain: 'Sign up again',
    backToLogin: 'Back to login',
    sendError: 'Could not send the email. Try again in a few seconds.',
  },
} as const


function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-auth
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 text-[var(--text-primary)]"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-[-22%] h-[58vh] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(230,255,61,0.07)_0%,transparent_68%)]" />
        <div className="absolute bottom-[-22%] right-[-10%] h-[58vh] w-[48vw] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.06)_0%,transparent_72%)]" />
      </div>

      <Link href="/" className="absolute left-6 top-6 z-10 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent)] text-[#0B0B0F]">
          <Zap size={16} fill="currentColor" />
        </span>
        <span className="font-display text-xl font-black tracking-[-0.04em]">geekore</span>
      </Link>

      <section className="relative z-10 w-full max-w-[440px] rounded-[30px] bg-[rgba(255,255,255,0.035)] p-8 shadow-[0_28px_80px_rgba(0,0,0,0.34)] ring-1 ring-white/10 backdrop-blur-xl sm:p-10">
        {children}
      </section>
    </main>
  )
}

function StatusIcon({ status }: { status: Status }) {
  const className = 'mx-auto mb-6 grid h-16 w-16 place-items-center rounded-[22px] ring-1'

  if (status === 'loading') {
    return (
      <div className={`${className} bg-[rgba(230,255,61,0.08)] text-[var(--accent)] ring-[rgba(230,255,61,0.18)]`}>
        <Loader2 size={30} className="animate-spin" />
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className={`${className} bg-emerald-400/10 text-emerald-300 ring-emerald-300/20`}>
        <CheckCircle size={31} />
      </div>
    )
  }

  return (
    <div className={`${className} bg-red-400/10 text-red-300 ring-red-300/20`}>
      <XCircle size={31} />
    </div>
  )
}

function ConfirmContent() {
  const router = useRouter()
  const { locale } = useLocale()
  const copy = confirmCopy[locale]
  const searchParams = useSearchParams()

  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle')

  useEffect(() => {
    const supabase = createClient()

    const confirm = async () => {
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      const code = searchParams.get('code')
      const emailParam = searchParams.get('email')

      if (emailParam) setResendEmail(decodeURIComponent(emailParam))

      await supabase.auth.signOut()
      document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'

      if (tokenHash) {
        const finalType = type && type.trim() !== '' ? type : 'signup'
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: finalType as any })

        if (!error) {
          await supabase.auth.signOut()
          document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
          setStatus('success')
          setTimeout(() => router.push('/login'), 2200)
          return
        }

        setErrorMessage(
          copy.expired
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
          setTimeout(() => router.push('/login'), 2200)
          return
        }
      }

      setErrorMessage(copy.missing)
      setStatus('error')
    }

    confirm()
  }, [router, searchParams])

  const handleResend = async () => {
    if (!resendEmail) return
    setResendStatus('sending')

    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: resendEmail,
      options: { emailRedirectTo: `https://geekore.it/auth/confirm?email=${encodeURIComponent(resendEmail)}` },
    })

    setResendStatus(error ? 'error' : 'sent')
  }

  return (
    <AuthShell>
      <div className="text-center">
        <StatusIcon status={status} />

        {status === 'loading' && (
          <>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">{copy.loadingKicker}</p>
            <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.05em]">{copy.loadingTitle}</h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">{copy.loadingBody}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">{copy.successKicker}</p>
            <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.05em]">{copy.successTitle}</h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">{copy.successBody}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-red-300">{copy.errorKicker}</p>
            <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.05em]">{copy.errorTitle}</h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">{errorMessage}</p>

            <div className="mt-8 space-y-3 text-left">
              {resendEmail ? (
                resendStatus === 'sent' ? (
                  <div className="flex items-start gap-3 rounded-[20px] bg-emerald-400/10 p-4 text-sm text-emerald-200 ring-1 ring-emerald-300/18">
                    <MailCheck size={18} className="mt-0.5 shrink-0" />
                    <span>{copy.sentTo} <strong>{resendEmail}</strong></span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendStatus === 'sending'}
                    className="flex h-13 w-full items-center justify-center gap-2 rounded-[18px] bg-[var(--accent)] px-4 font-black text-[#0B0B0F] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resendStatus === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                    {resendStatus === 'sending' ? copy.sending : copy.newLink}
                  </button>
                )
              ) : (
                <Link href="/register" className="flex h-13 w-full items-center justify-center rounded-[18px] bg-[var(--accent)] px-4 font-black text-[#0B0B0F] transition hover:brightness-105">
                  {copy.registerAgain}
                </Link>
              )}

              <Link href="/login" className="flex h-12 w-full items-center justify-center rounded-[18px] bg-white/[0.055] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:bg-white/[0.075]">
                {copy.backToLogin}
              </Link>
            </div>

            {resendStatus === 'error' && <p className="mt-3 text-xs font-semibold text-red-300">{copy.sendError}</p>}
          </>
        )}
      </div>
    </AuthShell>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={
      <AuthShell>
        <div className="flex justify-center py-8 text-[var(--accent)]"><Loader2 size={34} className="animate-spin" /></div>
      </AuthShell>
    }>
      <ConfirmContent />
    </Suspense>
  )
}
