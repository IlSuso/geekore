// src/app/page.tsx — Landing pubblica
// Design: hero centrato, eyebrow pill, community live via Suspense, feature pills

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Zap } from 'lucide-react'

// ─── Fetch dati reali ─────────────────────────────────────────────────────────

async function getCommunityStats() {
  const supabase = await createClient()
  const [
    { count: userCount },
    { count: mediaCount },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('user_media_entries').select('*', { count: 'exact', head: true }),
  ])
  return {
    userCount: userCount || 0,
    mediaCount: mediaCount || 0,
  }
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toString()
}

// ─── Community live (stream via Suspense) ─────────────────────────────────────

async function CommunityLive() {
  const { userCount, mediaCount } = await getCommunityStats()
  return (
    <div
      className="w-full mt-8 rounded-[20px] p-4"
      style={{ border: '1px solid var(--border)', background: 'rgba(20,20,27,0.6)' }}
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full" style={{ background: '#4ADE80' }} />
        <span className="gk-label" style={{ color: 'var(--text-secondary)' }}>Community live</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-display font-black tracking-tight text-[22px] leading-none" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
            {formatCount(userCount)}
          </p>
          <p className="mt-1 gk-label" style={{ color: 'var(--text-muted)' }}>geek iscritti</p>
        </div>
        <div>
          <p className="font-black tracking-tight text-[22px] leading-none" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
            {formatCount(mediaCount)}
          </p>
          <p className="mt-1 gk-label" style={{ color: 'var(--text-muted)' }}>media tracciati</p>
        </div>
        <div>
          <p className="font-black tracking-tight text-[22px] leading-none" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>5+</p>
          <p className="mt-1 gk-label" style={{ color: 'var(--text-muted)' }}>categorie</p>
        </div>
      </div>
    </div>
  )
}

function CommunityLiveSkeleton() {
  return (
    <div
      className="w-full mt-8 rounded-[20px] p-4 skeleton"
      style={{ border: '1px solid var(--border)', height: 96 }}
    />
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/home')

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(230,255,61,0.07), transparent)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-[14px] md:px-8"
        style={{ height: 52, borderBottom: '1px solid var(--border)', background: 'rgba(11,11,15,0.92)' }}
      >
        {/* Wordmark */}
        <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, letterSpacing: '-0.03em' }}>
          <div
            className="grid place-items-center flex-shrink-0"
            style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--accent)', color: '#0B0B0F' }}
            aria-hidden="true"
          ><Zap size={15} fill="currentColor" /></div>
          geekore
        </div>
        {/* CTA pills */}
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="gk-pill"
            style={{ height: 28, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-card)', borderColor: 'var(--border)', textDecoration: 'none' }}
          >
            Accedi
          </Link>
          <Link
            href="/register"
            className="gk-pill"
            style={{ height: 28, fontSize: 11, background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0B0B0F', fontWeight: 800, textDecoration: 'none' }}
          >
            Registrati
          </Link>
        </div>
      </header>

      {/* ── Mobile Hero ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col">

        {/* Mobile layout */}
        <div className="md:hidden px-[14px] pt-8 pb-4 flex flex-col flex-1">
          {/* Eyebrow pill */}
          <div className="gk-pill gk-pill-active mb-4 self-start" style={{ height: 'auto', padding: '5px 12px', fontSize: 12 }}>
            ● Il tuo universo geek in un unico posto
          </div>

          {/* Hero h1 */}
          <h1
            className="gk-display mb-4"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 42, lineHeight: 1, letterSpacing: '-0.04em' }}
          >
            Traccia tutto
            <br />
            <span style={{ color: 'var(--accent)' }}>ciò che ami</span>
          </h1>

          <p className="gk-body mb-6" style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            Anime, manga, videogiochi, serie TV e film in un unico profilo. Condividi i tuoi progressi con la community.
          </p>

          {/* CTAs */}
          <div className="flex flex-col gap-3 mb-4">
            <Link href="/register" className="gk-btn-primary text-center" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Registrati gratis
            </Link>
            <Link href="/login" className="gk-btn-secondary text-center" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Accedi
            </Link>
          </div>

          {/* Community live */}
          <Suspense fallback={<CommunityLiveSkeleton />}>
            <CommunityLive />
          </Suspense>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-6">
            {FEATURES.map((f) => (
              <span key={f} className="gk-pill">{f}</span>
            ))}
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden md:flex flex-col items-center justify-center flex-1 px-8 pb-16 text-center">
          {/* Eyebrow pill */}
          <div className="gk-pill gk-pill-active mb-8" style={{ height: 'auto', padding: '6px 16px', fontSize: 13 }}>
            ● Il tuo universo geek in un unico posto
          </div>

          {/* Hero h1 */}
          <h1
            className="gk-display mb-8"
            style={{ fontSize: 'clamp(56px, 8vw, 88px)', lineHeight: 1, letterSpacing: '-0.04em', fontWeight: 900, fontFamily: 'var(--font-display)', maxWidth: 900 }}
          >
            Traccia tutto
            <br />
            <span style={{ color: 'var(--accent)' }}>ciò che ami</span>
          </h1>

          <p style={{ fontSize: 18, lineHeight: 1.6, color: 'var(--text-secondary)', maxWidth: 520, marginBottom: 32 }}>
            Anime, manga, videogiochi, serie TV e film in un unico profilo. Condividi i tuoi progressi con la community.
          </p>

          {/* CTAs affiancate */}
          <div className="flex gap-4 mb-16">
            <Link
              href="/register"
              style={{ height: 54, padding: '0 32px', borderRadius: 18, background: 'var(--accent)', color: '#0B0B0F', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            >
              Registrati gratis
            </Link>
            <Link
              href="/login"
              style={{ height: 54, padding: '0 32px', borderRadius: 18, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
            >
              Accedi
            </Link>
          </div>

          {/* Community live — centrato su desktop */}
          <div style={{ maxWidth: 560, width: '100%' }}>
            <Suspense fallback={<CommunityLiveSkeleton />}>
              <CommunityLive />
            </Suspense>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 justify-center mt-10">
            {FEATURES.map((f) => (
              <span key={f} className="gk-pill">{f}</span>
            ))}
          </div>
        </div>
      </main>

      <footer
        className="text-center py-5 text-[12px]"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        Geekore — fatto con passione per i geek
      </footer>
    </div>
  )
}

const FEATURES = [
  'Anime & Manga', 'Videogiochi', 'Serie TV', 'Film',
  'Board Game', 'Steam', 'Progressi', 'Feed social',
]
