'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Loader2, MailCheck, XCircle, Zap } from 'lucide-react'

type Status = 'loading' | 'success' | 'error'

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-auth
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 text-[var(--text-primary)]"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-[-22%] h-[58vh] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(230,255,61,0.07)_0%,transparent_68%)]" />
        <div className="absolute bottom-[-22%] right-[-10%] h-[58vh] w-[48vw] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.055)_0%,transparent_72%)]" />
      </div>

      <Link href="/" className="absolute left-6 top-6 z-10 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent)] text-[#0B0B0F]">
          <Zap size={16} fill="currentColor" />
        </span>
        <span className="font-display text-xl font-black tracking-[-0.04em]">geekore</span>
      </Link>

      <section className="relative z-10 w-full max-w-[440px] rounded-[30px] bg-[rgba(255,255,255,0.035)] p-8 text-center shadow-[0_28px_80px_rgba(0,0,0,0.34)] ring-1 ring-white/10 backdrop-blur-xl sm:p-10">
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
        <MailCheck size={31} />
      </div>
    )
  }

  return (
    <div className={`${className} bg-red-400/10 text-red-300 ring-red-300/20`}>
      <XCircle size={31} />
    </div>
  )
}

function EmailChangeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<Status>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const confirm = async () => {
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      const code = searchParams.get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          setStatus('success')
          setTimeout(() => router.push('/profile/me'), 2200)
          return
        }
        setErrorMessage('Il link è scaduto o è già stato usato.')
        setStatus('error')
        return
      }

      if (!tokenHash) {
        setErrorMessage('Link non valido o mancante.')
        setStatus('error')
        return
      }

      const finalType = type && type.trim() !== '' ? type : 'email_change'
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: finalType as 'email_change' | 'signup' | 'recovery' | 'invite' | 'magiclink' | 'email',
      })

      if (error) {
        setErrorMessage('Il link è scaduto o già stato usato. Riprova dal pannello impostazioni.')
        setStatus('error')
        return
      }

      setStatus('success')
      setTimeout(() => router.push('/profile/me'), 2200)
    }

    confirm()
  }, [router, searchParams])

  return (
    <AuthShell>
      <StatusIcon status={status} />

      {status === 'loading' && (
        <>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">Cambio email</p>
          <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.05em]">Verifica in corso</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">Stiamo confermando il nuovo indirizzo email.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Email aggiornata</p>
          <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.05em]">Tutto fatto</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">Il tuo indirizzo email è stato cambiato. Tra poco ti riportiamo al profilo.</p>
          <CheckCircle size={18} className="mx-auto mt-6 text-emerald-300" />
        </>
      )}

      {status === 'error' && (
        <>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-red-300">Link non valido</p>
          <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.05em]">Problema con il link</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[var(--text-muted)]">{errorMessage}</p>
          <div className="mt-8 space-y-3 text-left">
            <Link href="/settings/profile" className="flex h-13 w-full items-center justify-center rounded-[18px] bg-[var(--accent)] px-4 font-black text-[#0B0B0F] transition hover:brightness-105">
              Torna alle impostazioni
            </Link>
            <Link href="/login" className="flex h-12 w-full items-center justify-center rounded-[18px] bg-white/[0.055] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:bg-white/[0.075]">
              Vai al login
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  )
}

export default function EmailChangePage() {
  return (
    <Suspense fallback={
      <AuthShell>
        <div className="flex justify-center py-8 text-[var(--accent)]"><Loader2 size={34} className="animate-spin" /></div>
      </AuthShell>
    }>
      <EmailChangeContent />
    </Suspense>
  )
}
