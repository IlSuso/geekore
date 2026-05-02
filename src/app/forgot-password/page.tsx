'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Mail, Zap, CheckCircle } from 'lucide-react'
import { PrimitiveButton } from '@/components/ui/PrimitiveButton'
import { PrimitiveInput } from '@/components/ui/PrimitiveInput'

function AuthWordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-[var(--text-primary)]" aria-label="Geekore home">
      <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-[var(--accent)] text-sm font-black text-[#0B0B0F]">
        <Zap size={15} fill="currentColor" />
      </span>
      <span className="font-display text-[22px] font-black tracking-[-0.03em]">geekore</span>
    </Link>
  )
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://geekore.it/auth/reset-password',
    })
    if (error) {
      setError('Errore nell\'invio. Controlla l\'email e riprova.')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <main data-auth className="gk-auth-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <header className="flex h-[52px] items-center justify-between px-[14px] md:px-8">
          <AuthWordmark />
        </header>

        <section className="flex min-h-[calc(100vh-52px)] items-start justify-center px-[14px] pb-10 pt-6 md:items-center md:pt-0">
          <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-[22px] text-center">
            <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl border border-emerald-400/30 bg-emerald-400/10">
              <CheckCircle size={36} className="text-emerald-400" />
            </div>
            <h1 className="gk-h1 mb-3">Email inviata!</h1>
            <p className="gk-body mb-2">Abbiamo inviato un link per reimpostare la password a</p>
            <p className="gk-body-strong mb-6 text-[var(--text-primary)]">{email}</p>
            <p className="gk-caption mb-8">Controlla anche la cartella spam. Il link scade dopo 1 ora.</p>
            <Link href="/login" className="gk-btn gk-btn-secondary gk-focus-ring w-full">
              Torna al login
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main data-auth className="gk-auth-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="flex h-[52px] items-center justify-between px-[14px] md:px-8">
        <AuthWordmark />
      </header>

      <section className="flex min-h-[calc(100vh-52px)] items-start justify-center px-[14px] pb-10 pt-6 md:items-center md:pt-0">
        <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-[22px]">
          <div className="mb-6">
            <p className="gk-label mb-2 text-[var(--accent)]">Reset</p>
            <h1 className="gk-h1 mb-2">Password dimenticata?</h1>
            <p className="gk-caption text-[var(--text-secondary)]">Inserisci la tua email e ti mandiamo un link per reimpostarla.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="relative">
              <PrimitiveInput
                name="email"
                label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tuo@email.com"
                autoComplete="email"
                className="pl-12"
                error={error || undefined}
                required
              />
              <Mail className="pointer-events-none absolute left-4 top-[42px] text-[var(--text-muted)]" size={18} />
            </div>

            <PrimitiveButton type="submit" disabled={loading} className="w-full">
              {loading ? 'Invio in corso...' : 'Invia link'}
            </PrimitiveButton>
          </form>

          <div className="mt-6 border-t border-[var(--border-soft)] pt-5 text-center">
            <p className="gk-caption">
              Ricordi la password?{' '}
              <Link href="/login" className="font-bold text-[var(--accent)] hover:opacity-80">
                Accedi
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
