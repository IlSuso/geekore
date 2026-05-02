'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Eye, EyeOff, Zap, CheckCircle, Mail } from 'lucide-react'
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
      >IT</button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={`h-7 rounded-lg px-3 text-xs font-bold transition-colors ${locale === 'en' ? 'bg-[var(--accent)] text-[#0B0B0F]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
      >EN</button>
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

function calcStrength(password: string): number {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (/[0-9]/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  if (password.length >= 12) score++
  return score
}

const STRENGTH_LABELS = ['', 'Debole', 'Media', 'Buona', 'Forte']
const STRENGTH_LABELS_EN = ['', 'Weak', 'Medium', 'Good', 'Strong']

function PasswordStrengthBar({ password, locale }: { password: string; locale: string }) {
  const strength = calcStrength(password)
  if (!password) return null
  const labels = locale === 'en' ? STRENGTH_LABELS_EN : STRENGTH_LABELS
  const activeColor = strength <= 1 ? '#EF4444' : strength === 2 ? '#F59E0B' : '#4ADE80'
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map(level => (
          <div
            key={level}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: strength >= level ? activeColor : 'var(--bg-elevated)' }}
          />
        ))}
      </div>
      <p className="text-xs font-medium" style={{ color: activeColor }}>
        {labels[strength]}
        {strength === 1 && (locale === 'en' ? ' — min. 8 chars, a number and a symbol' : ' — min. 8 caratteri, un numero e un simbolo')}
        {strength === 2 && (locale === 'en' ? ' — add a symbol or make it longer' : ' — aggiungi un simbolo o allungala')}
      </p>
    </div>
  )
}

function normalizeUsername(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 28)
}

function generateUsername(displayName: string, email: string): string {
  return normalizeUsername(displayName || email.split('@')[0]) || 'user'
}

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()
  const { locale, t } = useLocale()
  const l = t.register

  const passwordStrength = useMemo(() => calcStrength(password), [password])
  const passwordTooWeak = password.length > 0 && passwordStrength < 2

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordTooWeak) return
    setLoading(true)
    setError(null)
    try {
      const resolvedUsername = normalizeUsername(username) || generateUsername(displayName, email)
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split('@')[0],
            username: resolvedUsername,
          },
          emailRedirectTo: `https://geekore.it/auth/confirm?email=${encodeURIComponent(email)}`,
        },
      })
      if (error) { setError(error.message); return }
      setSuccess(true)
    } catch {
      setError(l.error)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <main data-auth className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <header className="flex h-[52px] items-center justify-between px-[14px] md:px-8">
          <AuthWordmark />
          <LocaleToggle />
        </header>
        <section className="flex min-h-[calc(100vh-52px)] items-center justify-center px-[14px] pb-10">
          <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-[22px] text-center">
            <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl border border-[rgba(230,255,61,0.2)] bg-[rgba(230,255,61,0.06)]">
              <Mail size={36} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="gk-h1 mb-3">{l.confirmTitle}</h1>
            <p className="gk-body mb-2">{l.confirmSent}</p>
            <p className="gk-body-strong mb-8 text-[var(--text-primary)]">{email}</p>
            <div className="mb-8 space-y-3 text-sm text-[var(--text-secondary)]">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle size={14} className="text-emerald-400" />
                <span>{l.confirmLink}</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <CheckCircle size={14} className="text-emerald-400" />
                <span>{l.confirmSpam}</span>
              </div>
            </div>
            <Link href="/login" className="gk-btn gk-btn-secondary gk-focus-ring w-full">
              {l.backToLogin}
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
        <LocaleToggle />
      </header>

      <section className="flex min-h-[calc(100vh-52px)] items-start justify-center px-[14px] pb-10 pt-6 md:items-center md:pt-0">
        <div className="w-full max-w-[420px] rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-[22px]">
          <div className="mb-6">
            <p className="gk-label mb-2 text-[var(--accent)]">Registrazione</p>
            <h1 className="gk-h1 mb-2">{l.title}</h1>
            <p className="gk-caption text-[var(--text-secondary)]">{l.subtitle}</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            <PrimitiveInput
              name="displayName"
              label={l.displayName}
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={l.displayNamePlaceholder}
              autoComplete="name"
            />

            <PrimitiveInput
              name="username"
              label="Username"
              type="text"
              value={username}
              onChange={e => setUsername(normalizeUsername(e.target.value))}
              placeholder="es. edo_geek"
              autoComplete="username"
              helperText="Solo lettere, numeri e underscore. Se lo lasci vuoto lo generiamo noi."
            />

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
              <label htmlFor="password" className="gk-label normal-case tracking-normal text-[var(--text-secondary)]">
                {l.password}
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={l.passwordPlaceholder}
                  autoComplete="new-password"
                  className="gk-input pr-12"
                  aria-invalid={passwordTooWeak ? true : undefined}
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
              <PasswordStrengthBar password={password} locale={locale} />
            </div>

            {error && (
              <p className="gk-input-error-msg rounded-2xl border border-red-500/30 bg-red-500/8 px-3 py-2" role="alert">
                {error}
              </p>
            )}

            <PrimitiveButton type="submit" disabled={loading || passwordTooWeak} className="w-full">
              {loading ? l.creating : l.create}
            </PrimitiveButton>
          </form>

          <div className="mt-6 border-t border-[var(--border-soft)] pt-5 text-center">
            <p className="gk-caption">
              {l.hasAccount}{' '}
              <Link href="/login" className="font-bold text-[var(--accent)] hover:opacity-80">
                {l.loginLink}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
