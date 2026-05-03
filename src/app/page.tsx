// DESTINAZIONE: src/app/page.tsx — Landing pubblica

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Zap, Gamepad2, Tv, BookOpen, Film, Layers, Trophy, Users, Sparkles, ArrowRight } from 'lucide-react'

async function getCommunityStats() {
  const supabase = await createClient()
  const [{ count: userCount }, { count: mediaCount }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('user_media_entries').select('*', { count: 'exact', head: true }),
  ])
  return { userCount: userCount || 0, mediaCount: mediaCount || 0 }
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

async function CommunityLive() {
  const { userCount, mediaCount } = await getCommunityStats()
  return (
    <div className="flex items-center gap-6 md:gap-8">
      <div className="text-center">
        <p className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>{formatCount(userCount)}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>Geek iscritti</p>
      </div>
      <div className="w-px h-7" style={{ background: 'var(--border)' }} />
      <div className="text-center">
        <p className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>{formatCount(mediaCount)}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>Media tracciati</p>
      </div>
      <div className="w-px h-7" style={{ background: 'var(--border)' }} />
      <div className="text-center">
        <p className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>5+</p>
        <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>Categorie</p>
      </div>
    </div>
  )
}

const FEATURES = [
  { icon: Gamepad2, label: 'Videogiochi', color: '#7C3AED', desc: 'Steam, Xbox, IGDB' },
  { icon: Layers, label: 'Anime & Manga', color: '#E6FF3D', desc: 'AniList, MAL' },
  { icon: Tv, label: 'Serie TV', color: '#0EA5E9', desc: 'TMDB integrato' },
  { icon: Film, label: 'Film', color: '#F97316', desc: 'Letterboxd import' },
  { icon: BookOpen, label: 'Board Game', color: '#10B981', desc: 'BGG collection' },
  { icon: Sparkles, label: 'Per Te', color: '#EC4899', desc: 'AI recommendations' },
  { icon: Trophy, label: 'Classifiche', color: '#F59E0B', desc: 'Leaderboard' },
  { icon: Users, label: 'Social', color: '#8B5CF6', desc: 'Feed & amici' },
]

function AppMockup() {
  const cards = [
    { title: 'Frieren', type: 'Anime', color: '#7C3AED', score: '9.0' },
    { title: 'Hades II', type: 'Game', color: '#E6FF3D', score: '9.4' },
    { title: 'The Boys', type: 'TV', color: '#0EA5E9', score: '8.7' },
    { title: 'Dune Part 2', type: 'Film', color: '#F97316', score: '8.5' },
  ]
  return (
    <div className="relative w-full max-w-[400px] mx-auto select-none">
      {/* Glow */}
      <div className="absolute inset-0 -z-10 scale-110" style={{ background: 'radial-gradient(ellipse 70% 70% at 50% 50%, rgba(230,255,61,0.14), transparent)' }} />
      {/* App shell */}
      <div className="rounded-[28px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.08)]" style={{ background: 'rgba(16,16,22,0.97)', backdropFilter: 'blur(24px)' }}>
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="w-5 h-5 rounded-[6px] grid place-items-center" style={{ background: 'var(--accent)' }}>
            <Zap size={11} fill="#0B0B0F" color="#0B0B0F" />
          </div>
          <span className="text-xs font-black tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>geekore</span>
          <div className="ml-auto flex gap-1.5">
            {['#FF5F57', '#FEBC2E', '#28C840'].map(c => <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />)}
          </div>
        </div>
        {/* Per Te section */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={12} style={{ color: 'var(--accent)' }} />
            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Per te</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {cards.map(card => (
              <div key={card.title} className="rounded-[14px] overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="h-20 w-full" style={{ background: `linear-gradient(135deg, ${card.color}22, ${card.color}08)` }}>
                  <div className="absolute top-1.5 left-1.5">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: card.color, color: card.color === '#E6FF3D' ? '#0B0B0F' : 'white' }}>{card.type}</span>
                  </div>
                  <div className="absolute top-1.5 right-1.5 text-[10px] font-black" style={{ color: '#F59E0B' }}>★ {card.score}</div>
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[11px] font-bold leading-tight truncate">{card.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Stats strip */}
        <div className="mx-4 mb-4 mt-2 rounded-[12px] px-3 py-2 flex items-center justify-between" style={{ background: 'rgba(230,255,61,0.06)', border: '1px solid rgba(230,255,61,0.15)' }}>
          <div className="text-center">
            <p className="text-[13px] font-black" style={{ color: 'var(--accent)' }}>142</p>
            <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Media</p>
          </div>
          <div className="text-center">
            <p className="text-[13px] font-black" style={{ color: 'var(--accent)' }}>4.2★</p>
            <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Score</p>
          </div>
          <div className="text-center">
            <p className="text-[13px] font-black" style={{ color: 'var(--accent)' }}>18</p>
            <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Amici</p>
          </div>
        </div>
      </div>
      {/* Floating badge */}
      <div className="absolute -bottom-3 -right-3 rounded-2xl px-3 py-2 shadow-xl" style={{ background: 'rgba(16,16,22,0.95)', border: '1px solid rgba(230,255,61,0.3)', backdropFilter: 'blur(16px)' }}>
        <p className="text-[11px] font-black" style={{ color: 'var(--accent)' }}>🏆 Top Tracker</p>
        <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>questa settimana</p>
      </div>
    </div>
  )
}

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/home')

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
    }}>
      {/* Background effects — centrati */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(230,255,61,0.07) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '10%', left: '10%', width: '40vw', height: '40vh', background: 'radial-gradient(ellipse at center, rgba(124,58,237,0.05) 0%, transparent 70%)', borderRadius: '50%' }} />
        <div className="absolute inset-0 opacity-[0.022]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 md:px-10 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2.5" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 20, letterSpacing: '-0.03em' }}>
          <div className="grid place-items-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 10, background: 'var(--accent)', color: '#0B0B0F' }}>
            <Zap size={16} fill="currentColor" />
          </div>
          geekore
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="px-4 h-9 rounded-xl text-sm font-bold flex items-center transition-colors" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            Accedi
          </Link>
          <Link href="/register" className="px-4 h-9 rounded-xl text-sm font-black flex items-center gap-1.5 transition-all hover:scale-[1.02]" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
            Registrati <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col">

        {/* Desktop hero: 2 col — centrato */}
        <div className="hidden md:flex items-center justify-center px-10 xl:px-20 py-16 min-h-[calc(100vh-65px)]">
          <div className="w-full max-w-5xl mx-auto grid grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold mb-8" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.25)', color: 'var(--accent)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                Il tuo universo geek in un unico posto
              </div>

              <h1 className="font-black leading-[0.95] tracking-[-0.04em] mb-6" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(48px, 5.5vw, 76px)' }}>
                Traccia tutto<br />
                <span style={{ color: 'var(--accent)' }}>ciò che ami</span>
              </h1>

              <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--text-secondary)', maxWidth: 420 }}>
                Anime, manga, videogiochi, serie TV e film in un unico profilo. Consigli personalizzati, classifica e feed sociale.
              </p>

              <div className="flex gap-3 mb-12">
                <Link href="/register" className="flex items-center gap-2 px-7 font-black text-[15px] rounded-[16px] transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(230,255,61,0.22)]" style={{ height: 52, background: 'var(--accent)', color: '#0B0B0F', fontFamily: 'var(--font-display)' }}>
                  Registrati gratis <ArrowRight size={16} />
                </Link>
                <Link href="/login" className="flex items-center px-7 font-bold text-[15px] rounded-[16px] transition-colors" style={{ height: 52, border: '1px solid var(--border)', color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
                  Accedi
                </Link>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: '#4ADE80' }} />
                <span className="text-xs font-bold uppercase tracking-widest mr-4" style={{ color: 'var(--text-muted)' }}>Community live</span>
                <Suspense fallback={<span className="text-sm text-zinc-600">...</span>}>
                  <CommunityLive />
                </Suspense>
              </div>
            </div>

            {/* Right: app mockup */}
            <div className="flex justify-center">
              <AppMockup />
            </div>
          </div>
        </div>

        {/* Mobile hero */}
        <div className="md:hidden px-5 pt-10 pb-6 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold self-center mb-6" style={{ background: 'rgba(230,255,61,0.08)', border: '1px solid rgba(230,255,61,0.25)', color: 'var(--accent)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
            Il tuo universo geek
          </div>

          <h1 className="font-black leading-[0.95] tracking-[-0.04em] mb-5" style={{ fontFamily: 'var(--font-display)', fontSize: 44 }}>
            Traccia tutto<br />
            <span style={{ color: 'var(--accent)' }}>ciò che ami</span>
          </h1>

          <p className="text-base leading-relaxed mb-8 max-w-sm" style={{ color: 'var(--text-secondary)' }}>
            Anime, manga, videogiochi, serie TV e film. Con consigli personalizzati e feed sociale.
          </p>

          <div className="flex flex-col gap-3 mb-10 w-full max-w-xs">
            <Link href="/register" className="flex items-center justify-center gap-2 font-black text-[15px] rounded-[16px]" style={{ height: 52, background: 'var(--accent)', color: '#0B0B0F', fontFamily: 'var(--font-display)' }}>
              Registrati gratis <ArrowRight size={15} />
            </Link>
            <Link href="/login" className="flex items-center justify-center font-bold text-[15px] rounded-[16px]" style={{ height: 52, border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              Accedi
            </Link>
          </div>

          <div className="w-full px-4">
            <AppMockup />
          </div>
        </div>

        {/* Feature grid */}
        <div className="relative z-10 px-5 md:px-10 xl:px-20 pb-20">
          <div className="max-w-5xl mx-auto">
            <div className="pt-10 md:pt-6">
              <p className="text-[11px] font-black uppercase tracking-widest mb-6 text-center md:text-left" style={{ color: 'var(--text-muted)' }}>Tutto in un posto</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {FEATURES.map(({ icon: Icon, label, color, desc }) => (
                  <div key={label} className="rounded-[18px] p-4 transition-all hover:scale-[1.01]" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-9 h-9 rounded-[12px] grid place-items-center mb-3" style={{ background: `${color}18` }}>
                      <Icon size={18} style={{ color }} />
                    </div>
                    <p className="font-black text-[13px] mb-0.5">{label}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 text-center py-5 text-[12px]" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
        Geekore — fatto con passione per i geek
      </footer>
    </div>
  )
}
