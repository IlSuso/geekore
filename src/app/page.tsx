import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowRight, BookOpen, Film, Gamepad2, Layers, Sparkles, Tv, Users, Zap } from 'lucide-react'
import { getServerLocale, type Locale } from '@/lib/i18n/serverLocale'

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

async function CommunityLive({ locale }: { locale: Locale }) {
  const { userCount, mediaCount } = await getCommunityStats()
  const labels = locale === 'en' ? { universes: 'Universes' } : { universes: 'Universi' }

  return (
    <div className="flex items-center gap-5 text-left">
      <div>
        <p className="font-display text-2xl font-black tracking-[-0.04em] text-[var(--accent)]">{formatCount(userCount)}</p>
        <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Geek</p>
      </div>
      <div className="h-8 w-px bg-white/10" />
      <div>
        <p className="font-display text-2xl font-black tracking-[-0.04em] text-[var(--accent)]">{formatCount(mediaCount)}</p>
        <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Media</p>
      </div>
      <div className="h-8 w-px bg-white/10" />
      <div>
        <p className="font-display text-2xl font-black tracking-[-0.04em] text-[var(--accent)]">5+</p>
        <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{labels.universes}</p>
      </div>
    </div>
  )
}

function getFeatureLinks(locale: Locale) {
  return locale === 'en' ? [
    { icon: Gamepad2, label: 'Video games', text: 'Steam, Xbox, IGDB', color: '#22C55E' },
    { icon: Layers, label: 'Anime & Manga', text: 'AniList, MAL', color: '#E6FF3D' },
    { icon: Tv, label: 'TV Shows', text: 'TMDB', color: '#0EA5E9' },
    { icon: Film, label: 'Movies', text: 'Letterboxd', color: '#F97316' },
    { icon: BookOpen, label: 'Board games', text: 'BGG', color: '#10B981' },
    { icon: Sparkles, label: 'For You', text: 'Taste DNA', color: '#EC4899' },
    { icon: Users, label: 'Social', text: 'Feed and friends', color: '#8B5CF6' },
  ] : [
    { icon: Gamepad2, label: 'Videogiochi', text: 'Steam, Xbox, IGDB', color: '#22C55E' },
    { icon: Layers, label: 'Anime & Manga', text: 'AniList, MAL', color: '#E6FF3D' },
    { icon: Tv, label: 'Serie TV', text: 'TMDB', color: '#0EA5E9' },
    { icon: Film, label: 'Film', text: 'Letterboxd', color: '#F97316' },
    { icon: BookOpen, label: 'Board game', text: 'BGG', color: '#10B981' },
    { icon: Sparkles, label: 'Per te', text: 'Taste DNA', color: '#EC4899' },
    { icon: Users, label: 'Social', text: 'Feed e amici', color: '#8B5CF6' },
  ]
}

function AppPreview({ locale }: { locale: Locale }) {
  const preview = locale === 'en'
    ? { forYou: 'For You', subtitle: 'Recommendations from your Taste DNA', media: 'Media', score: 'Score', friends: 'Friends' }
    : { forYou: 'Per te', subtitle: 'Consigli dal tuo Taste DNA', media: 'Media', score: 'Score', friends: 'Amici' }
  const rows = [
    { title: 'Frieren', type: 'Anime', score: '9.0', color: '#7C3AED' },
    { title: 'Hades II', type: 'Game', score: '9.4', color: '#22C55E' },
    { title: 'The Boys', type: 'TV', score: '8.7', color: '#0EA5E9' },
    { title: 'Dune Part 2', type: 'Film', score: '8.5', color: '#F97316' },
  ]

  return (
    <div className="relative mx-auto w-full max-w-[430px] select-none">
      <div className="absolute inset-0 -z-10 scale-105 rounded-[36px] bg-[radial-gradient(circle_at_50%_20%,rgba(230,255,61,0.20),transparent_58%)] blur-2xl" />
      <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[rgba(17,17,23,0.92)] shadow-[0_30px_100px_rgba(0,0,0,0.48)] backdrop-blur-2xl">
        <div className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
          <div className="grid h-6 w-6 place-items-center rounded-[8px] bg-[var(--accent)] text-[#0B0B0F]">
            <Zap size={13} fill="currentColor" />
          </div>
          <span className="font-display text-xs font-black tracking-[-0.03em]">geekore</span>
          <div className="ml-auto flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
        </div>

        <div className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">{preview.forYou}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{preview.subtitle}</p>
            </div>
            <div className="rounded-full border border-[rgba(230,255,61,0.24)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[11px] font-black text-[var(--accent)]">
              92% match
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {rows.map(item => (
              <div key={item.title} className="overflow-hidden rounded-[17px] bg-white/[0.035] ring-1 ring-white/8">
                <div className="relative h-24" style={{ background: `linear-gradient(135deg, ${item.color}30, ${item.color}08)` }}>
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-black uppercase"
                    style={{ background: item.color, color: item.color === '#E6FF3D' ? '#0B0B0F' : '#fff' }}
                  >
                    {item.type}
                  </span>
                  <span className="absolute right-2 top-2 text-[10px] font-black text-amber-400">★ {item.score}</span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[12px] font-black text-[var(--text-primary)]">{item.title}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-[18px] border border-[rgba(230,255,61,0.16)] bg-[rgba(230,255,61,0.055)] p-3 text-center">
            <div>
              <p className="font-display text-[16px] font-black text-[var(--accent)]">142</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">{preview.media}</p>
            </div>
            <div>
              <p className="font-display text-[16px] font-black text-[var(--accent)]">4.2★</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">{preview.score}</p>
            </div>
            <div>
              <p className="font-display text-[16px] font-black text-[var(--accent)]">18</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">{preview.friends}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function LandingPage() {
  const locale = await getServerLocale()
  const landing = locale === 'en' ? {
    login: 'Log in', register: 'Sign up', badge: 'Your geek universe',
    title: 'Everything you love, in one profile.',
    subtitle: 'Anime, manga, video games, TV shows, movies and board games in one place: library, recommendations, swipe and social feed without splitting everything across a thousand apps.',
    registerFree: 'Sign up free', communityLive: 'Live community', connected: 'Connected universes', connectedTitle: 'One place, more signals.'
  } : {
    login: 'Accedi', register: 'Registrati', badge: 'Il tuo universo geek',
    title: 'Tutto ciò che ami, in un profilo.',
    subtitle: 'Anime, manga, videogiochi, serie TV, film e board game nello stesso posto: library, consigli, swipe e feed sociale senza duplicare tutto tra mille app.',
    registerFree: 'Registrati gratis', communityLive: 'Community live', connected: 'Universi collegati', connectedTitle: 'Un solo posto, più segnali.'
  }
  const featureLinks = getFeatureLinks(locale)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/home')

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/2 top-[-18%] h-[620px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(230,255,61,0.085),transparent_68%)] blur-2xl" />
        <div className="absolute bottom-[-20%] right-[-12%] h-[520px] w-[620px] rounded-full bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.09),transparent_68%)] blur-2xl" />
        <div className="absolute inset-0 opacity-[0.018] [background-image:linear-gradient(rgba(255,255,255,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:56px_56px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[20px] font-black tracking-[-0.04em]">
          <span className="grid h-8 w-8 place-items-center rounded-[11px] bg-[var(--accent)] text-[#0B0B0F]">
            <Zap size={17} fill="currentColor" />
          </span>
          geekore
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/login" className="flex h-10 items-center rounded-[14px] bg-white/[0.045] px-4 text-sm font-bold text-[var(--text-secondary)] ring-1 ring-white/10 transition hover:bg-white/[0.075]">
            {landing.login}
          </Link>
          <Link href="/register" className="flex h-10 items-center gap-1.5 rounded-[14px] bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition hover:scale-[1.02]">
            {landing.register} <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid min-h-[calc(100vh-72px)] max-w-7xl items-center gap-12 px-5 py-12 md:grid-cols-[1.08fr_0.92fr] md:px-10 md:py-16 xl:px-8">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.24)] bg-[rgba(230,255,61,0.075)] px-4 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              {landing.badge}
            </div>

            <h1 className="max-w-[720px] font-display text-[clamp(52px,7.5vw,96px)] font-black leading-[0.88] tracking-[-0.07em]">
              {landing.title}
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--text-secondary)]">
              {landing.subtitle}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-[var(--accent)] px-7 font-display text-[15px] font-black text-[#0B0B0F] shadow-[0_18px_50px_rgba(230,255,61,0.12)] transition hover:scale-[1.015]">
                {landing.registerFree} <ArrowRight size={16} />
              </Link>
              <Link href="/login" className="flex h-14 items-center justify-center rounded-[18px] bg-white/[0.045] px-7 text-[15px] font-bold text-[var(--text-primary)] ring-1 ring-white/10 transition hover:bg-white/[0.075]">
                {landing.login}
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {landing.communityLive}
              </div>
              <Suspense fallback={<span className="text-sm text-[var(--text-muted)]">...</span>}>
                <CommunityLive locale={locale} />
              </Suspense>
            </div>
          </div>

          <AppPreview locale={locale} />
        </section>

        <section className="relative mx-auto max-w-7xl px-5 pb-20 md:px-10 xl:px-8">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{landing.connected}</p>
              <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{landing.connectedTitle}</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            {featureLinks.map(({ icon: Icon, label, text, color }) => (
              <div key={label} className="rounded-[20px] bg-white/[0.032] p-4 ring-1 ring-white/8 transition hover:-translate-y-0.5 hover:bg-white/[0.055]">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-[14px]" style={{ background: `${color}18` }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <p className="text-sm font-black text-[var(--text-primary)]">{label}</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
