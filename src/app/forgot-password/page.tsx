'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck, Zap } from 'lucide-react'
import { useLocale } from '@/lib/locale'


const FORGOT_COPY = {
  it: {
    homeAria: 'Home Geekore', login: 'Login', sendError: "Errore nell'invio. Controlla l'email e riprova.", linkSent: 'Link inviato', checkMail: 'Controlla la mail', sentTo: 'Abbiamo inviato il link di reset a:', spamHint: 'Controlla anche spam o promozioni. Il link può scadere dopo poco tempo per sicurezza.', backLogin: 'Torna al login', eyebrow: 'Reset password', title: 'Recupera accesso', description: 'Inserisci la mail del tuo account. Ti mandiamo un link sicuro per scegliere una nuova password.', email: 'Email', sending: 'Invio in corso...', send: 'Invia link di reset', remember: 'Ricordi la password?', signIn: 'Accedi',
  },
  en: {
    homeAria: 'Geekore home', login: 'Login', sendError: 'Could not send the email. Check the address and try again.', linkSent: 'Link sent', checkMail: 'Check your email', sentTo: 'We sent the reset link to:', spamHint: 'Check spam or promotions too. For security, the link may expire after a short time.', backLogin: 'Back to login', eyebrow: 'Password reset', title: 'Recover access', description: 'Enter your account email. We will send you a secure link to choose a new password.', email: 'Email', sending: 'Sending...', send: 'Send reset link', remember: 'Remember your password?', signIn: 'Sign in',
  },
} as const

function AuthWordmark() {
  const { locale } = useLocale()
  const copy = FORGOT_COPY[locale] || FORGOT_COPY.it
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-[var(--text-primary)]" aria-label={copy.homeAria}>
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent)] text-sm font-black text-[#0B0B0F]">
        <Zap size={16} fill="currentColor" />
      </span>
      <span className="font-display text-[22px] font-black tracking-[-0.04em]">geekore</span>
    </Link>
  )
}

function RecoveryShell({ children, loginLabel }: { children: React.ReactNode; loginLabel: string }) {
  return (
    <main data-auth className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute left-1/2 top-[-24%] h-[48vh] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(230,255,61,0.07),transparent_68%)]" />
        <div className="absolute bottom-[-22%] right-[-14%] h-[58vh] w-[44vw] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.05),transparent_70%)]" />
      </div>

      <header className="relative z-10 flex h-16 items-center justify-between px-5 md:px-8">
        <AuthWordmark />
        <Link href="/login" className="inline-flex h-9 items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/[0.03] px-3 text-xs font-black text-[var(--text-secondary)] transition-colors hover:text-white">
          <ArrowLeft size={14} /> {loginLabel}
        </Link>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-64px)] items-start justify-center px-5 pb-10 pt-8 md:items-center md:pt-0">
        {children}
      </section>
    </main>
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const { locale } = useLocale()
  const fc = FORGOT_COPY[locale] || FORGOT_COPY.it

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://geekore.it/auth/reset-password',
    })

    if (error) setError(fc.sendError)
    else setSent(true)

    setLoading(false)
  }

  if (sent) {
    return (
      <RecoveryShell loginLabel={fc.login}>
        <div className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-[var(--border)] bg-[rgba(20,20,28,0.78)] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.34)] ring-1 ring-white/5 backdrop-blur-xl md:p-7">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-[24px] border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
            <CheckCircle2 size={32} />
          </div>
          <p className="gk-label mb-2 text-emerald-300">{fc.linkSent}</p>
          <h1 className="font-display text-[30px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)]">{fc.checkMail}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{fc.sentTo}</p>
          <p className="mt-1 break-all font-mono-data text-sm font-black text-[var(--accent)]">{email}</p>
          <div className="mt-5 rounded-2xl border border-[var(--border-subtle)] bg-black/18 p-4 text-left">
            <div className="flex gap-3">
              <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-[var(--text-muted)]" />
              <p className="text-xs leading-5 text-[var(--text-muted)]">{fc.spamHint}</p>
            </div>
          </div>
          <Link href="/login" className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[var(--border)] bg-white/[0.03] text-sm font-black text-[var(--text-primary)] transition-colors hover:bg-white/[0.06]">
            {fc.backLogin}
          </Link>
        </div>
      </RecoveryShell>
    )
  }

  return (
    <RecoveryShell loginLabel={fc.login}>
      <div className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-[var(--border)] bg-[rgba(20,20,28,0.78)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ring-1 ring-white/5 backdrop-blur-xl md:p-7">
        <div className="mb-6">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-[18px] border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.08)] text-[var(--accent)]">
            <Mail size={21} />
          </div>
          <p className="gk-label mb-2 text-[var(--accent)]">{fc.eyebrow}</p>
          <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)]">{fc.title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{fc.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-2 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">{fc.email}</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={17} />
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tuo@email.com"
                autoComplete="email"
                required
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] pl-11 pr-4 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[rgba(230,255,61,0.45)]"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || email.trim().length === 0}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {loading ? fc.sending : fc.send}
          </button>
        </form>

        <p className="mt-6 border-t border-[var(--border-soft)] pt-5 text-center text-xs text-[var(--text-muted)]">
          {fc.remember}{' '}
          <Link href="/login" className="font-black text-[var(--accent)] hover:opacity-80">{fc.signIn}</Link>
        </p>
      </div>
    </RecoveryShell>
  )
}
