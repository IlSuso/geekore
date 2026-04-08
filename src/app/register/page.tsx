'use client'

import { useState } from 'react'
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
        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${locale === 'it' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-white'}`}
      >🇮🇹</button>
      <button
        onClick={() => setLocale('en')}
        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${locale === 'en' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-white'}`}
      >🇬🇧</button>
    </div>
  )
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
  const { t } = useLocale()
  const l = t.register

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: displayName || email.split('@')[0] } },
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
      <div className="min-h-[calc(100vh-4rem)] bg-zinc-950 flex items-center justify-center p-6">
        <div className="text-center max-w-md mx-auto">
          <div className="w-20 h-20 bg-violet-500/10 border border-violet-500/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Mail size={36} className="text-violet-400" />
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
    <div className="min-h-[calc(100vh-4rem)] flex items-stretch bg-zinc-950">

      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between p-16 overflow-hidden border-r border-zinc-800/50">
        <div className="absolute top-1/3 -left-20 w-96 h-96 bg-fuchsia-600/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-violet-600/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tighter">geekore</span>
        </div>

        <div className="relative space-y-6">
          <h2 className="text-5xl font-black tracking-tighter leading-none">
            {l.tagline.split(' ').slice(0, -1).join(' ')}<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
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

          {/* Top row: mobile logo + locale toggle */}
          <div className="flex items-center justify-between mb-10">
            <div className="lg:hidden flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
                <Zap size={20} className="text-white" />
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
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{l.email}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={l.emailPlaceholder} autoComplete="email"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{l.password}</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={l.passwordPlaceholder} autoComplete="new-password" minLength={6}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder-zinc-600 focus:outline-none transition-colors"
                  required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-5 py-3.5 rounded-2xl text-sm">{error}</div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-lg transition-all disabled:opacity-60 shadow-lg shadow-violet-500/20 mt-2">
              {loading ? l.creating : l.create}
            </button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-8">
            {l.hasAccount}{' '}
            <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
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
