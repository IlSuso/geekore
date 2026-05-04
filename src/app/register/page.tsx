'use client'
// DESTINAZIONE: src/app/register/page.tsx

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Eye, EyeOff, Zap, CheckCircle, Mail, Gamepad2, Layers, Tv, Film, Sparkles, ArrowRight } from 'lucide-react'
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

function registerBrandItems(locale: 'it' | 'en') {
  return locale === 'en'
    ? [
      { icon: Gamepad2, label: 'Games & Steam', color: '#7C3AED' },
      { icon: Layers, label: 'Anime & Manga', color: '#E6FF3D' },
      { icon: Tv, label: 'TV Shows', color: '#0EA5E9' },
      { icon: Film, label: 'Movies & Letterboxd', color: '#F97316' },
      { icon: Sparkles, label: 'AI recommendations', color: '#EC4899' },
    ]
    : [
      { icon: Gamepad2, label: 'Videogiochi & Steam', color: '#7C3AED' },
      { icon: Layers, label: 'Anime & Manga', color: '#E6FF3D' },
      { icon: Tv, label: 'Serie TV', color: '#0EA5E9' },
      { icon: Film, label: 'Film & Letterboxd', color: '#F97316' },
      { icon: Sparkles, label: 'Raccomandazioni AI', color: '#EC4899' },
    ]
}

const registerHeroCopy = {
  it: {
    titleA: 'Inizia a costruire',
    titleB: 'il tuo mondo Geekore',
    body: 'Unisci librerie, wishlist e raccomandazioni in un profilo unico.',
    track: 'Importa e organizza',
    haveAccount: 'Hai già un account?',
    login: 'Accedi',
    username: 'Username',
    usernamePlaceholder: 'username_unico',
    optional: 'opzionale',
    showPassword: 'Mostra password',
    hidePassword: 'Nascondi password',
    passwordStrength: 'Forza password',
    weakPassword: 'Password troppo debole',
    desktopTitleA: 'Tutto ciò che',
    desktopTitleB: 'segui, qui',
    desktopBody: 'Un profilo unico per ogni media che ami. Gratis per sempre.',
    includes: 'Include tutto questo',
    freeTitle: 'Gratis per sempre',
    freeBody: 'Nessuna carta. Nessun piano premium nascosto.',
    registerLabel: 'Registrazione',
  },
  en: {
    titleA: 'Start building',
    titleB: 'your Geekore world',
    body: 'Bring libraries, wishlists, and recommendations into one profile.',
    track: 'Import and organize',
    haveAccount: 'Already have an account?',
    login: 'Sign in',
    username: 'Username',
    usernamePlaceholder: 'unique_username',
    optional: 'optional',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    passwordStrength: 'Password strength',
    weakPassword: 'Password too weak',
    desktopTitleA: 'Everything you',
    desktopTitleB: 'follow, here',
    desktopBody: 'One profile for every kind of media you love. Free forever.',
    includes: 'Includes all of this',
    freeTitle: 'Free forever',
    freeBody: 'No card. No hidden premium plan.',
    registerLabel: 'Sign up',
  },
} as const


function calcStrength(p: string): number {
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (/[0-9]/.test(p)) s++
  if (/[^a-zA-Z0-9]/.test(p)) s++
  if (p.length >= 12) s++
  return s
}

function normalizeUsername(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_').replace(/^_|_$/, '').substring(0, 28)
}

const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)' } as const
const labelStyle = { fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }

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
  const hero = registerHeroCopy[locale]
  const brandItems = registerBrandItems(locale)
  const strength = calcStrength(password)
  const passwordTooWeak = useMemo(() => password.length > 0 && strength < 2, [password, strength])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordTooWeak) return
    setLoading(true); setError(null)
    try {
      const resolvedUsername = username.trim() || normalizeUsername(displayName || email.split('@')[0]) || 'user'
      const { error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { display_name: displayName || email.split('@')[0], username: resolvedUsername },
          emailRedirectTo: `https://geekore.it/auth/confirm?email=${encodeURIComponent(email)}`,
        },
      })
      if (error) { setError(error.message); return }
      setSuccess(true)
    } catch { setError(l.error) } finally { setLoading(false) }
  }

  if (success) {
    return (
      <main data-auth className="min-h-screen flex items-center justify-center px-5 relative overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '60vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(230,255,61,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />
        </div>
        <div className="relative w-full max-w-[380px] text-center">
          <div className="rounded-[28px] p-10" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.2)' }}>
              <Mail size={28} style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="font-black text-2xl mb-2" style={{ fontFamily: 'var(--font-display)' }}>{l.confirmTitle}</h1>
            <p className="text-sm mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{l.confirmSent}</p>
            <p className="font-bold mb-6">{email}</p>
            <div className="space-y-2 text-sm mb-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
              <div className="flex items-center justify-center gap-2"><CheckCircle size={13} className="text-emerald-400" /><span>{l.confirmLink}</span></div>
              <div className="flex items-center justify-center gap-2"><CheckCircle size={13} className="text-emerald-400" /><span>{l.confirmSpam}</span></div>
            </div>
            <Link href="/login" className="gk-btn gk-btn-secondary gk-focus-ring w-full block text-center">{l.backToLogin}</Link>
          </div>
        </div>
      </main>
    )
  }

  const strengthColor = strength <= 1 ? '#EF4444' : strength === 2 ? '#F59E0B' : '#4ADE80'
  const strengthLabel = locale === 'en'
    ? ['', 'Weak', 'Medium', 'Good', 'Strong'][strength]
    : ['', 'Debole', 'Media', 'Buona', 'Forte'][strength]

  const FormFields = (
    <form onSubmit={handleRegister} className="space-y-4" noValidate>
      <div>
        <label style={labelStyle}>{l.displayName}</label>
        <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={l.displayNamePlaceholder} autoComplete="name"
          className="auth-input w-full h-12 rounded-2xl px-4 text-sm font-medium outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>{hero.username} <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({hero.optional})</span></label>
        <input type="text" value={username} onChange={e => setUsername(normalizeUsername(e.target.value))} placeholder="es. edo_geek" autoComplete="username"
          className="auth-input w-full h-12 rounded-2xl px-4 text-sm font-medium outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>{l.email}</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={l.emailPlaceholder} autoComplete="email" required
          className="auth-input w-full h-12 rounded-2xl px-4 text-sm font-medium outline-none" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>{l.password}</label>
        <div className="relative">
          <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={l.passwordPlaceholder} autoComplete="new-password" required
            className="auth-input w-full h-12 rounded-2xl px-4 pr-12 text-sm font-medium outline-none" style={inputStyle} />
          <button type="button" onClick={() => setShowPassword(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-xl hover:bg-white/5 transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)' }}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {password && (
          <div className="mt-2.5">
            <div className="flex gap-1 mb-1.5">
              {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 3, flex: 1, borderRadius: 99, background: strength >= i ? strengthColor : 'rgba(255,255,255,0.08)', transition: 'background 0.2s' }} />)}
            </div>
            <p className="text-[11px] font-semibold" style={{ color: strengthColor }}>{strengthLabel}</p>
          </div>
        )}
      </div>
      {error && (
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#F87171' }}>
          {error}
        </div>
      )}
      <PrimitiveButton type="submit" disabled={loading || passwordTooWeak} className="w-full !mt-6">
        {loading ? l.creating : l.create}
      </PrimitiveButton>
    </form>
  )

  return (
    <main data-auth className="gk-auth-page min-h-screen relative overflow-hidden" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>

      {/* Background glows - no grid (already in globals.css) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div style={{ position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)', width: '70vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(230,255,61,0.055) 0%, transparent 65%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-10%', left: '0', width: '40vw', height: '50vh', background: 'radial-gradient(ellipse at center, rgba(14,165,233,0.04) 0%, transparent 70%)', borderRadius: '50%' }} />
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
                {hero.desktopTitleA}<br />
                <span style={{ color: 'var(--accent)' }}>{hero.desktopTitleB}</span>
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {hero.desktopBody}
              </p>
            </div>

            <div className="space-y-2.5">
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>{hero.includes}</p>
              {brandItems.map(({ icon: Icon, label, color }) => (
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
            <p className="text-xs font-black mb-0.5" style={{ color: 'var(--accent)' }}>{hero.freeTitle}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{hero.freeBody}</p>
          </div>
        </div>

        {/* Right: form */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex h-14 items-center justify-between px-12 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {hero.haveAccount}{' '}
              <Link href="/login" className="font-black" style={{ color: 'var(--accent)' }}>{hero.login}</Link>
            </span>
            <LocaleToggle />
          </div>

          <div className="flex flex-1 items-center justify-center p-10">
            <div className="w-full max-w-[420px]">

              {/* Form card */}
              <div className="rounded-[28px] p-8" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', boxShadow: '0 24px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
                <div className="mb-7">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--accent)' }}>{hero.registerLabel}</p>
                  <h1 className="font-black mb-1.5" style={{ fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '-0.03em' }}>{l.title}</h1>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.subtitle}</p>
                </div>
                {FormFields}
              </div>

              <p className="mt-5 text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {hero.haveAccount} <Link href="/login" className="font-black" style={{ color: 'var(--accent)' }}>{hero.login}</Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile form */}
      <div className="md:hidden relative z-10 px-5 py-8" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="mb-7">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--accent)' }}>{hero.registerLabel}</p>
          <h1 className="font-black mb-1.5" style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.03em' }}>{l.title}</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{l.subtitle}</p>
        </div>

        <div className="rounded-[24px] p-6 mb-5" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 40px rgba(0,0,0,0.25)' }}>
          {FormFields}
        </div>

        <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {hero.haveAccount} <Link href="/login" className="font-black" style={{ color: 'var(--accent)' }}>{hero.login}</Link>
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
