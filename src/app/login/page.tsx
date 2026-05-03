'use client'
// DESTINAZIONE: src/app/login/page.tsx

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Zap, Gamepad2, Layers, Tv, Film, Sparkles, ArrowRight } from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { PrimitiveButton } from '@/components/ui/PrimitiveButton'

function LocaleToggle() {
  const { locale, setLocale } = useLocale()
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
      {(['it', 'en'] as const).map(l => (
        <button key={l} type="button" onClick={() => setLocale(l)}
          className={`h-7 rounded-md px-3 text-xs font-bold transition-all uppercase ${locale === l ? 'bg-[var(--accent)] text-[#0B0B0F]' : 'text-white/40 hover:text-white/70'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

const BRAND_ITEMS = [
  { icon: Gamepad2, label: 'Videogiochi', color: '#7C3AED' },
  { icon: Layers, label: 'Anime & Manga', color: '#E6FF3D' },
  { icon: Tv, label: 'Serie TV', color: '#0EA5E9' },
  { icon: Film, label: 'Film', color: '#F97316' },
  { icon: Sparkles, label: 'Per Te — AI', color: '#EC4899' },
]

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
    const { data: profile } = await supabase.from('profiles').select('onboarding_done').eq('id', userId).single()
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
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await redirectAfterLogin(data.user.id)
    } catch { setError(l.error) } finally { setLoading(false) }
  }

  return (
    <main data-auth className="gk-auth-page min-h-screen relative overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* Background glows - no grid (already in globals.css) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '70vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(230,255,61,0.06) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '0', width: '40vw', height: '50vh', background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.05) 0%, transparent 70%)', borderRadius: '50%' }} />
      </div>

      {/* Mobile header */}
      <header className="md:hidden relative z-10 flex h-14 items-center justify-between px-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[8px] grid place-items-center" style={{ background: 'var(--accent)' }}>
            <Zap size={14} fill="#0B0B0F" color="#0B0B0F" />
          </div>
          <span className="font-black text-[18px] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>geekore</span>
        </Link>
        <LocaleToggle />
      </header>

      {/* Desktop 2-col layout */}
      <div className="hidden md:flex relative z-10" style={{ height: '100vh' }}>

        {/* Left brand panel */}
        <div className="relative flex flex-col" style={{ width: 380, flexShrink: 0, background: 'rgba(255,255,255,0.018)', borderRight: '1px solid rgba(255,255,255,0.07)', padding: '40px 36px' }}>
          {/* Subtle panel glow */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, rgba(230,255,61,0.03) 0%, transparent 60%)' }} />

          <Link href="/" className="relative flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] grid place-items-center" style={{ background: 'var(--accent)' }}>
              <Zap size={16} fill="#0B0B0F" color="#0B0B0F" />
            </div>
            <span className="font-black text-xl tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>geekore</span>
          </Link>

          <div className="relative flex-1 flex flex-col justify-center gap-8">
            <div>
              <h2 className="font-black leading-tight mb-3" style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.03em' }}>
                Bentornato<br />
                <span style={{ color: 'var(--accent)' }}>nel tuo mondo</span>
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Accedi per vedere i tuoi progressi e le raccomandazioni personalizzate.
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>Traccia tutto ciò che ami</p>
              {BRAND_ITEMS.map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="grid place-items-center flex-shrink-0" style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}22` }}>
                    <Icon size={15} style={{ color }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative rounded-2xl p-4" style={{ background: 'rgba(230,255,61,0.04)', border: '1px solid rgba(230,255,61,0.12)' }}>
            <p className="text-xs font-black mb-1" style={{ color: 'var(--accent)' }}>Non hai un account?</p>
            <Link href="/register" className="inline-flex items-center gap-1.5 text-xs font-bold transition-opacity hover:opacity-80" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Registrati gratis <ArrowRight size={11} />
            </Link>
          </div>
        </div>

        {/* Right: form centered */}
        <div className="flex flex-1 flex-col">
          {/* Top bar */}
          <div className="flex h-14 items-center justify-between px-12 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Non hai un account?{' '}
              <Link href="/register" className="font-black" style={{ color: 'var(--accent)' }}>Registrati</Link>
            </span>
            <LocaleToggle />
          </div>

          {/* Centered form */}
          <div className="flex flex-1 items-center justify-center p-10">
            <div className="w-full max-w-[400px]">

              {/* Form card */}
              <div className="rounded-[28px] p-8" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', boxShadow: '0 24px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                <div className="mb-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--accent)' }}>Accesso</p>
                  <h1 className="font-black mb-1.5" style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.03em' }}>{l.welcome}</h1>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.subtitle}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="email" className="block text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.email}</label>
                    <input id="email" type="email" name="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder={l.emailPlaceholder} autoComplete="email" required
                      className="auth-input w-full h-12 rounded-2xl px-4 text-sm font-medium outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label htmlFor="password" className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.password}</label>
                      <Link href="/forgot-password" className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Password dimenticata?</Link>
                    </div>
                    <div className="relative">
                      <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)} placeholder={l.passwordPlaceholder}
                        autoComplete="current-password" required
                        className="auth-input w-full h-12 rounded-2xl px-4 pr-12 text-sm font-medium outline-none transition-all"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
                      <button type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-xl transition-colors hover:bg-white/5"
                        style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
                      {error}
                    </div>
                  )}

                  <PrimitiveButton type="submit" disabled={loading} className="w-full !mt-6">
                    {loading ? l.signingIn : l.signIn}
                  </PrimitiveButton>
                </form>
              </div>

              <p className="mt-5 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Non hai un account?{' '}
                <Link href="/register" className="font-black" style={{ color: 'var(--accent)' }}>{l.registerLink}</Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile form */}
      <div className="md:hidden relative z-10 px-5 py-8" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="mb-7">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--accent)' }}>Accesso</p>
          <h1 className="font-black mb-1.5" style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.03em' }}>{l.welcome}</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.subtitle}</p>
        </div>

        <div className="rounded-[24px] p-6 mb-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 40px rgba(0,0,0,0.25)' }}>
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div>
              <label htmlFor="m-email" className="block text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.email}</label>
              <input id="m-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={l.emailPlaceholder} autoComplete="email" required
                className="auth-input w-full h-12 rounded-2xl px-4 text-sm font-medium outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label htmlFor="m-pw" className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.password}</label>
                <Link href="/forgot-password" className="text-xs font-bold" style={{ color: 'var(--accent)' }}>Dimenticata?</Link>
              </div>
              <div className="relative">
                <input id="m-pw" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={l.passwordPlaceholder} autoComplete="current-password" required
                  className="auth-input w-full h-12 rounded-2xl px-4 pr-12 text-sm font-medium outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' }} />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
                {error}
              </div>
            )}
            <PrimitiveButton type="submit" disabled={loading} className="w-full !mt-2">{loading ? l.signingIn : l.signIn}</PrimitiveButton>
          </form>
        </div>

        <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Non hai un account? <Link href="/register" className="font-black" style={{ color: 'var(--accent)' }}>{l.registerLink}</Link>
        </p>
      </div>

      <style>{`
        .auth-input::placeholder { color: rgba(255,255,255,0.2); }
        .auth-input:focus {
          border-color: rgba(230,255,61,0.45) !important;
          background: rgba(255,255,255,0.07) !important;
          box-shadow: 0 0 0 3px rgba(230,255,61,0.07), inset 0 1px 0 rgba(255,255,255,0.04);
        }
      `}</style>
    </main>
  )
}
