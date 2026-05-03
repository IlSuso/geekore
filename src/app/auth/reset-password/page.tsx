'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Zap } from 'lucide-react'

function AuthWordmark() {
  return (
    <Link href="/" className="inline-flex items-center gap-2 text-[var(--text-primary)]" aria-label="Geekore home">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--accent)] text-sm font-black text-[#0B0B0F]">
        <Zap size={16} fill="currentColor" />
      </span>
      <span className="font-display text-[22px] font-black tracking-[-0.04em]">geekore</span>
    </Link>
  )
}

function passwordScore(value: string): number {
  let score = 0
  if (value.length >= 8) score++
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++
  if (/\d/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value)) score++
  return score
}

function ResetShell({ children }: { children: React.ReactNode }) {
  return (
    <main data-auth className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute left-1/2 top-[-24%] h-[48vh] w-[70vw] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(230,255,61,0.07),transparent_68%)]" />
        <div className="absolute bottom-[-22%] left-[-14%] h-[58vh] w-[44vw] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.05),transparent_70%)]" />
      </div>

      <header className="relative z-10 flex h-16 items-center justify-between px-5 md:px-8">
        <AuthWordmark />
        <Link href="/login" className="inline-flex h-9 items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/[0.03] px-3 text-xs font-black text-[var(--text-secondary)] transition-colors hover:text-white">
          <ArrowLeft size={14} /> Login
        </Link>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-64px)] items-start justify-center px-5 pb-10 pt-8 md:items-center md:pt-0">
        {children}
      </section>
    </main>
  )
}

function ResetContent() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const score = passwordScore(password)
  const passwordsMatch = confirm.length > 0 && password === confirm
  const canSubmit = password.length >= 8 && passwordsMatch && !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('La password deve essere almeno 8 caratteri.'); return }
    if (password !== confirm) { setError('Le password non coincidono.'); return }

    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError('Errore nel reset. Il link potrebbe essere scaduto.')
    else {
      setDone(true)
      setTimeout(() => router.push('/login'), 2200)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <ResetShell>
        <div className="w-full max-w-[430px] rounded-[28px] border border-[var(--border)] bg-[rgba(20,20,28,0.78)] p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.34)] ring-1 ring-white/5 backdrop-blur-xl">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-[24px] border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
            <CheckCircle2 size={32} />
          </div>
          <p className="gk-label mb-2 text-emerald-300">Password aggiornata</p>
          <h1 className="font-display text-[30px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)]">Tutto pronto</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Ti stiamo riportando al login.</p>
        </div>
      </ResetShell>
    )
  }

  return (
    <ResetShell>
      <div className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-[var(--border)] bg-[rgba(20,20,28,0.78)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ring-1 ring-white/5 backdrop-blur-xl md:p-7">
        <div className="mb-6">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-[18px] border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.08)] text-[var(--accent)]">
            <KeyRound size={21} />
          </div>
          <p className="gk-label mb-2 text-[var(--accent)]">Nuova password</p>
          <h1 className="font-display text-[32px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)]">Proteggi l’account</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Scegli una password nuova. Dopo il salvataggio torni al login.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="password" className="mb-2 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Nuova password</label>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Almeno 8 caratteri"
                minLength={8}
                required
                className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 pr-12 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[rgba(230,255,61,0.45)]"
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-white/[0.04] hover:text-white" aria-label={showPw ? 'Nascondi password' : 'Mostra password'}>
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map(i => <div key={i} className={`h-1 flex-1 rounded-full ${score >= i ? 'bg-[var(--accent)]' : 'bg-white/10'}`} />)}
                </div>
                <p className="mt-1 font-mono-data text-[10px] text-[var(--text-muted)]">Forza password: {score <= 1 ? 'debole' : score === 2 ? 'media' : score === 3 ? 'buona' : 'forte'}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirm" className="mb-2 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">Conferma password</label>
            <input
              id="confirm"
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError('') }}
              placeholder="Ripeti la password"
              required
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[rgba(230,255,61,0.45)]"
            />
            {confirm.length > 0 && !passwordsMatch && <p className="mt-2 text-xs text-red-300">Le password non coincidono.</p>}
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-black/18 p-4">
            <div className="flex gap-3">
              <ShieldCheck size={17} className="mt-0.5 flex-shrink-0 text-[var(--text-muted)]" />
              <p className="text-xs leading-5 text-[var(--text-muted)]">Usa almeno 8 caratteri. Meglio se include lettere maiuscole, numeri e simboli.</p>
            </div>
          </div>

          {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

          <button type="submit" disabled={!canSubmit} className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent)] text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-55">
            {loading ? 'Aggiornamento...' : 'Aggiorna password'}
          </button>
        </form>
      </div>
    </ResetShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    }>
      <ResetContent />
    </Suspense>
  )
}
