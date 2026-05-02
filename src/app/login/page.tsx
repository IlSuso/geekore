'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Zap } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { PrimitiveButton } from '@/components/ui/PrimitiveButton'
import { PrimitiveInput } from '@/components/ui/PrimitiveInput'

function LocaleToggle() {
  const { locale, setLocale } = useLocale()
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1" aria-label="Seleziona lingua">
      <button
        type="button"
        onClick={() => setLocale('it')}
        className={`h-7 rounded-lg px-3 text-xs font-bold transition-colors ${locale === 'it' ? 'bg-[var(--accent)] text-[#0B0B0F]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
      >
        IT
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={`h-7 rounded-lg px-3 text-xs font-bold transition-colors ${locale === 'en' ? 'bg-[var(--accent)] text-[#0B0B0F]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
      >
        EN
      </button>
    </div>
  )
}

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

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()
  const { t } = useLocale()
  const l = t.login

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) redirectAfterLogin(session.user.id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const redirectAfterLogin = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_done')
      .eq('id', userId)
      .single()

    if (profile?.onboarding_done === true) {
      const maxAge = 60 * 60 * 24 * 365
      const secure = location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `geekore_onboarding_done=1; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
      router.push('/home')
    } else {
      router.push('/onboarding')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await redirectAfterLogin(data.user.id)
    } catch {
      setError(l.error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main data-auth className="gk-auth-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <header className="flex h-[52px] items-center justify-between px-[14px] md:px-8">
        <AuthWordmark />
        <LocaleToggle />
      </header>

      <section className="flex min-h-[calc(100vh-52px)] items-start justify-center px-[14px] pb-10 pt-6 md:items-center md:pt-0">
        <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-[22px]">
          <div className="mb-6">
            <p className="gk-label mb-2 text-[var(--accent)]">Accesso</p>
            <h1 className="gk-h1 mb-2">{l.welcome}</h1>
            <p className="gk-caption text-[var(--text-secondary)]">{l.subtitle}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <PrimitiveInput
              name="email"
              label={l.email}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={l.emailPlaceholder}
              autoComplete="email"
              required
            />

            <div className="gk-field">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="password" className="gk-label normal-case tracking-normal text-[var(--text-secondary)]">
                  {l.password}
                </label>
                <Link href="/forgot-password" className="text-xs font-bold text-[var(--accent)] hover:opacity-80">
                  Password dimenticata?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={l.passwordPlaceholder}
                  autoComplete="current-password"
                  className="gk-input pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-[14px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
                  aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="gk-input-error-msg rounded-2xl border border-red-500/30 bg-red-500/8 px-3 py-2" role="alert">
                {error}
              </p>
            )}

            <PrimitiveButton type="submit" disabled={loading} className="w-full">
              {loading ? l.signingIn : l.signIn}
            </PrimitiveButton>
          </form>

          <div className="mt-6 border-t border-[var(--border-soft)] pt-5 text-center">
            <p className="gk-caption">
              {l.noAccount}{' '}
              <Link href="/register" className="font-bold text-[var(--accent)] hover:opacity-80">
                {l.registerLink}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
