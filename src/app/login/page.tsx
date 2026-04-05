'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Zap, Gamepad2, BookOpen, Film } from 'lucide-react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const redirectTo = searchParams.get('redirect')

  // Note: session check removed — middleware already redirects logged-in users

  const goAfterLogin = async (userId: string) => {
    // If middleware set a redirect target, use it (validate it's a relative path)
    if (redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      router.push(redirectTo)
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single()
    router.push(profile?.username ? `/profile/${profile.username}` : '/feed')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await goAfterLogin(data.user.id)
    } catch {
      setError('Email o password non corretti')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-stretch bg-zinc-950">

      {/* Left — Branding panel (desktop) */}
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
              Tutto ciò<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                che ami.
              </span>
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Anime, manga, videogiochi, film e serie. Traccia tutto in un unico posto e condividi con la community.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: BookOpen, label: 'Anime & Manga', color: 'text-sky-400', bg: 'bg-sky-400/10' },
              { icon: Gamepad2, label: 'Videogiochi & Steam', color: 'text-green-400', bg: 'bg-green-400/10' },
              { icon: Film, label: 'Film & Serie TV', color: 'text-red-400', bg: 'bg-red-400/10' },
            ].map(({ icon: Icon, label, color, bg }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
                  <Icon size={18} className={color} />
                </div>
                <span className="text-zinc-300 text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-zinc-700">Geekore — fatto con passione per i geek</p>
      </div>

      {/* Right — Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tighter">geekore</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Bentornato</h1>
            <p className="text-zinc-500">Accedi al tuo account per continuare</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tuo@email.com"
                autoComplete="email"
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder-zinc-600 focus:outline-none transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-5 py-3.5 rounded-2xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-lg transition-all disabled:opacity-60 shadow-lg shadow-violet-500/20 mt-2"
            >
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>

          <p className="text-center text-zinc-500 text-sm mt-8">
            Non hai un account?{' '}
            <Link href="/register" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
              Registrati gratis
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginForm />
    </Suspense>
  )
}
