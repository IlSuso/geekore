'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Zap, Gamepad2, Layers, Film } from 'lucide-react'
import { useLocale } from '@/lib/locale'

function LocaleToggle() {
  const { locale, setLocale } = useLocale()
  return (
    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
      <button onClick={() => setLocale('it')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${locale === 'it' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-white'}`}>IT</button>
      <button onClick={() => setLocale('en')} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${locale === 'en' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-white'}`}>EN</button>
    </div>
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
  }, [])

  const redirectAfterLogin = async (userId: string) => {
    console.log('[LOGIN DEBUG] redirectAfterLogin chiamato con userId:', userId)

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('onboarding_done')
      .eq('id', userId)
      .single()

    console.log('[LOGIN DEBUG] risultato query profile:', {
      profile,
      error,
      onboarding_done: profile?.onboarding_done,
      type: typeof profile?.onboarding_done,
    })

    if (profile?.onboarding_done === true) {
      console.log('[LOGIN DEBUG] → onboarding_done TRUE, vado a /home')
      const maxAge = 60 * 60 * 24 * 365
      const secure = location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `geekore_onboarding_done=1; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
      router.push('/home')
    } else {
      console.log('[LOGIN DEBUG] → onboarding_done NON TRUE, vado a /onboarding. Valore:', profile?.onboarding_done, 'Error:', error)
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

  const FEATURES = [
    { icon: Layers, label: l.features[0], color: 'text-sky-400', bg: 'bg-sky-400/10' },
    { icon: Gamepad2, label: l.features[1], color: 'text-green-400', bg: 'bg-green-400/10' },
    { icon: Film, label: l.features[2], color: 'text-red-400', bg: 'bg-red-400/10' },
  ]

  return (
    <div className="min-h-screen flex items-stretch bg-zinc-950">
      <div className="hidden lg:flex lg:w-[45%] relative flex-col justify-between p-16 overflow-hidden border-r border-zinc-800/50">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/3 right-0 w-72 h-72 bg-fuchsia-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tighter">geekore</span>
        </div>
        <div className="relative space-y-10">
          <div>
            <h2 className="text-5xl font-black tracking-tighter leading-none mb-5">
              {l.tagline.split(' ').slice(0, -1).join(' ')}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                {l.tagline.split(' ').slice(-1)[0]}
              </span>
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">{l.description}</p>
          </div>
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, label, color, bg }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon size={18} className={color} />
                </div>
                <span className="text-zinc-300 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-zinc-700">{l.footer}</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
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
            <h1 className="text-3xl font-bold tracking-tight mb-2">{l.welcome}</h1>
            <p className="text-zinc-500">{l.subtitle}</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{l.email}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={l.emailPlaceholder} autoComplete="email"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors" required />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-zinc-400">{l.password}</label>
                <Link href="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                  Password dimenticata?
                </Link>
              </div>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={l.passwordPlaceholder} autoComplete="current-password"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder-zinc-600 focus:outline-none transition-colors" required />
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
              {loading ? l.signingIn : l.signIn}
            </button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-8">
            {l.noAccount}{' '}
            <Link href="/register" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              {l.registerLink}
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