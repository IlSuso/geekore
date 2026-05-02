// DESTINAZIONE: src/app/register/page.tsx

'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Eye, EyeOff, Zap, CheckCircle, Mail } from 'lucide-react'
import { useLocale } from '@/lib/locale'

function LocaleToggle() {
  const { locale, setLocale } = useLocale()
  return (
    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
      <button
        onClick={() => setLocale('it')}
        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${locale === 'it' ? '' : 'text-zinc-500 hover:text-white'}`}
        style={locale === 'it' ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
      >IT</button>
      <button
        onClick={() => setLocale('en')}
        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${locale === 'en' ? '' : 'text-zinc-500 hover:text-white'}`}
        style={locale === 'en' ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
      >EN</button>
    </div>
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
const STRENGTH_COLORS = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-400', 'bg-emerald-500']
const STRENGTH_TEXT_COLORS = ['', 'text-red-400', 'text-yellow-400', 'text-emerald-400', 'text-emerald-400']

function PasswordStrengthBar({ password, locale }: { password: string; locale: string }) {
  const strength = calcStrength(password)
  if (!password) return null
  const labels = locale === 'en' ? STRENGTH_LABELS_EN : STRENGTH_LABELS
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(level => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              strength >= level ? STRENGTH_COLORS[strength] : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${STRENGTH_TEXT_COLORS[strength]}`}>
        {labels[strength]}
        {strength === 1 && (locale === 'en' ? ' — min. 8 chars, a number and a symbol' : ' — min. 8 caratteri, un numero e un simbolo')}
        {strength === 2 && (locale === 'en' ? ' — add a symbol or make it longer' : ' — aggiungi un simbolo o allungala')}
      </p>
    </div>
  )
}

function generateUsername(displayName: string, email: string): string {
  const base = displayName || email.split('@')[0]
  return base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')  // sostituisce tutto ciò che non è valido con _
    .replace(/_{2,}/g, '_')        // collassa underscore multipli
    .replace(/^_|_$/g, '')         // rimuove underscore iniziali/finali
    .substring(0, 28)              // max 28 chars (lascia spazio per suffisso numerico nel trigger)
    || 'user'                      // fallback se tutto viene rimosso
}

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
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
      const username = generateUsername(displayName, email)
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split('@')[0],
            username,
          },
          emailRedirectTo: `https://geekore.it/auth/confirm?email=${encodeURIComponent(email)}`
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
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-6">
        <div className="text-center max-w-md mx-auto">
          <div className="w-20 h-20 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Mail size={36} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">{l.confirmTitle}</h1>
          <p className="text-zinc-400 leading-relaxed mb-2">{l.confirmSent}</p>
          <p className="text-white font-semibold mb-8">{email}</p>
          <div className="space-y-3 text-sm text-zinc-500 mb-10">
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle size={14} className="text-emerald-500" />
              <span>{l.confirmLink}</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <CheckCircle size={14} className="text-emerald-500" />
              <span>{l.confirmSpam}</span>
            </div>
          </div>
          <Link href="/login"
            className="inline-flex items-center gap-2 px-8 py-3 border border-zinc-700 hover:border-zinc-500 rounded-full text-sm font-medium transition-colors">
            {l.backToLogin}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="gk-auth-page min-h-screen flex items-stretch bg-[var(--bg-primary)]">

      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between p-16 overflow-hidden border-r border-zinc-800/50">
        <div className="absolute top-1/3 -left-20 w-96 h-96 rounded-full blur-[120px] pointer-events-none" style={{ background: 'rgba(230,255,61,0.05)' }} />
        <div className="absolute bottom-1/4 right-0 w-72 h-72 rounded-full blur-[100px] pointer-events-none" style={{ background: "rgba(230,255,61,0.05)" }} />

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Zap size={20} className="text-black" />
          </div>
          <span className="text-2xl font-bold tracking-tighter">geekore</span>
        </div>

        <div className="relative space-y-6">
          <h2 className="text-5xl font-black tracking-tighter leading-none">
            {l.tagline.split(' ').slice(0, -1).join(' ')}<br />
            <span style={{ color: 'var(--accent)' }}>
              {l.tagline.split(' ').slice(-1)[0]}
            </span>
          </h2>
          <p className="text-zinc-400 text-lg leading-relaxed">{l.description}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            {l.tags.map((tag: string) => (
              <span key={tag} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-400">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-zinc-700">{l.footer}</p>
      </div>

      {/* Right — Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          <div className="flex items-center justify-between mb-10">
            <div className="lg:hidden flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
                <Zap size={20} className="text-black" />
              </div>
              <span className="text-2xl font-bold tracking-tighter">geekore</span>
            </div>
            <div className="hidden lg:block" />
            <LocaleToggle />
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">{l.title}</h1>
            <p className="text-zinc-500">{l.subtitle}</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{l.displayName}</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                placeholder={l.displayNamePlaceholder} autoComplete="name"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl px-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{l.email}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={l.emailPlaceholder} autoComplete="email"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl px-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{l.password}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={l.passwordPlaceholder} autoComplete="new-password"
                  className={`w-full bg-zinc-900 border rounded-2xl px-5 py-3.5 pr-12 text-white placeholder-zinc-600 focus:outline-none transition-colors ${
                    passwordTooWeak ? 'border-red-500/60 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-600'
                  }`}
                  required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <PasswordStrengthBar password={password} locale={locale} />
            </div>
            {error && (
              <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-5 py-3.5 rounded-2xl text-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading || passwordTooWeak}
              className="w-full py-4 rounded-2xl font-semibold text-lg transition-all disabled:opacity-60 mt-2"
              style={{ background: 'var(--accent)', color: '#0B0B0F' }}
            >
              {loading ? l.creating : l.create}
            </button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-8">
            {l.hasAccount}{' '}
            <Link href="/login" className="font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--accent)' }}>
              {l.loginLink}
            </Link>
          </p>

          <p className="text-center text-zinc-700 text-xs mt-6">
            <Link href="/privacy" className="hover:text-zinc-500 transition-colors">{t.legal.privacy}</Link>
            {' · '}
            <Link href="/terms" className="hover:text-zinc-500 transition-colors">{t.legal.terms}</Link>
          </p>
        </div>
      </div>
    </div>
  )
}