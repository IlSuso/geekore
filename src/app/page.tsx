import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/feed')

  return (
    <div className="min-h-screen bg-[#080810] text-white flex flex-col overflow-hidden">

      {/* Background glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-20 right-1/4 w-72 h-72 bg-fuchsia-600/15 rounded-full blur-[100px]" />
        <div className="absolute top-40 left-1/2 w-48 h-48 bg-cyan-500/10 rounded-full blur-[80px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-5 sm:px-10 py-5 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
              <path d="M13 2L4.09 12.97 12 12l-1 9 8.91-10.97L12 11z"/>
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tighter">geekore</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors rounded-xl hover:bg-white/5">
            Accedi
          </Link>
          <Link href="/register" className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl hover:brightness-110 transition-all shadow-md shadow-violet-500/20">
            Registrati
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center pt-12 sm:pt-20 pb-24 px-5">

        {/* Badge */}
        <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-300 text-xs sm:text-sm font-medium mb-10 animate-fade-up">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400"></span>
          </span>
          Social network per la cultura geek
        </div>

        {/* Heading */}
        <h1 className="text-center font-black tracking-tighter leading-[0.9] mb-6 animate-fade-up" style={{ animationDelay: '80ms', fontSize: 'clamp(3rem, 10vw, 7rem)' }}>
          Traccia tutto<br />
          <span className="grad-text">ciò che ami</span>
        </h1>

        {/* Subline */}
        <p className="text-zinc-400 text-base sm:text-xl text-center max-w-lg leading-relaxed mb-10 animate-fade-up" style={{ animationDelay: '160ms' }}>
          Anime, manga, videogiochi, serie TV, film e board game. Un profilo unico, una community reale.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 animate-fade-up" style={{ animationDelay: '240ms' }}>
          <Link href="/register" className="group relative px-8 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl font-bold text-base sm:text-lg hover:brightness-110 transition-all shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02]">
            Inizia gratis
            <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <Link href="/login" className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold text-base sm:text-lg transition-all backdrop-blur">
            Ho già un account
          </Link>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-8 mt-14 mb-20 animate-fade-up" style={{ animationDelay: '320ms' }}>
          {STATS.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl sm:text-3xl font-black grad-text-violet">{s.value}</div>
              <div className="text-xs text-zinc-600 mt-0.5 tracking-wide uppercase">{s.label}</div>
            </div>
          ))}
        </div>

        {/* App preview */}
        <div className="w-full max-w-5xl mx-auto animate-fade-up" style={{ animationDelay: '400ms' }}>
          <div className="relative">
            {/* Glow border */}
            <div className="absolute -inset-px bg-gradient-to-r from-violet-500/30 via-fuchsia-500/20 to-cyan-500/20 rounded-[28px] blur-sm" />
            <div className="absolute -inset-px bg-gradient-to-r from-violet-500/30 via-transparent to-cyan-500/20 rounded-[28px]" />

            {/* Bottom fade */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#080810] to-transparent z-10 rounded-b-[28px] pointer-events-none" />

            {/* Content */}
            <div className="relative bg-zinc-900/60 backdrop-blur-2xl border border-white/8 rounded-[28px] p-5 sm:p-8">

              {/* Fake browser bar */}
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 mx-4 h-6 bg-white/5 rounded-lg flex items-center px-3">
                  <span className="text-[10px] text-zinc-600">geekore.app/profile</span>
                </div>
              </div>

              {/* Mock content */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                {MOCK_CARDS.map((card, i) => (
                  <div key={i} className="group rounded-2xl overflow-hidden border border-white/8 bg-zinc-800/50 card-hover cursor-default" style={{ animationDelay: `${400 + i * 60}ms` }}>
                    <div className="relative h-28 sm:h-36 overflow-hidden" style={{ background: card.gradient }}>
                      {/* Overlay shimmer */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      {/* Type pill */}
                      <span className={`absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${card.tagColor}`}>{card.type}</span>
                      {/* Mock image placeholder icon */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-20">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                          {card.icon}
                        </svg>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[11px] font-semibold truncate leading-tight">{card.title}</div>
                      <div className="flex gap-0.5 mt-1.5">
                        {[1,2,3,4,5].map(s => (
                          <svg key={s} width="9" height="9" viewBox="0 0 24 24">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill={s <= card.stars ? '#fbbf24' : '#374151'} />
                          </svg>
                        ))}
                      </div>
                      <div className="mt-1.5 h-0.5 rounded-full bg-zinc-700 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full" style={{ width: `${card.progress}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 max-w-4xl mx-auto w-full">
          <p className="text-center text-zinc-600 text-xs tracking-[0.3em] uppercase mb-8">Tutto quello che ti serve</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {FEATURE_CARDS.map((f, i) => (
              <div key={i} className="group p-4 sm:p-5 bg-zinc-900/50 border border-zinc-800/60 rounded-2xl hover:border-violet-500/30 hover:bg-zinc-900 transition-all">
                <div className={`w-9 h-9 ${f.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <span className="text-lg">{f.icon}</span>
                </div>
                <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-zinc-700 text-xs border-t border-white/5">
        <span className="grad-text-violet font-semibold">geekore</span> — fatto con passione per i geek
      </footer>
    </div>
  )
}

const STATS = [
  { value: '6+', label: 'Categorie' },
  { value: '∞', label: 'Titoli' },
  { value: '100%', label: 'Gratis' },
]

const MOCK_CARDS = [
  { title: 'Attack on Titan', type: 'Anime', stars: 5, progress: 85, tagColor: 'bg-sky-500', gradient: 'linear-gradient(135deg, #0f172a, #1e1b4b)', icon: <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/> },
  { title: 'Elden Ring', type: 'Gioco', stars: 5, progress: 60, tagColor: 'bg-green-600', gradient: 'linear-gradient(135deg, #1c0a00, #3b1500)', icon: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/> },
  { title: 'One Piece', type: 'Manga', stars: 4, progress: 30, tagColor: 'bg-orange-500', gradient: 'linear-gradient(135deg, #0c1445, #1a237e)', icon: <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/> },
  { title: 'Breaking Bad', type: 'Serie', stars: 5, progress: 100, tagColor: 'bg-purple-500', gradient: 'linear-gradient(135deg, #0a1628, #1a2744)', icon: <path d="M23 7l-7 5 7 5V7z M1 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/> },
]

const FEATURE_CARDS = [
  { icon: '📺', title: 'Anime & Manga', desc: 'Traccia episodi e capitoli con AniList', bg: 'bg-sky-500/10' },
  { icon: '🎮', title: 'Videogiochi', desc: 'Integrazione Steam automatica', bg: 'bg-green-500/10' },
  { icon: '🎬', title: 'Film & Serie', desc: 'Database completo via TMDB', bg: 'bg-red-500/10' },
  { icon: '🎲', title: 'Board Game', desc: 'BoardGameGeek integrato', bg: 'bg-yellow-500/10' },
  { icon: '⭐', title: 'Voti & Note', desc: 'Valuta con stelle e aggiungi note', bg: 'bg-amber-500/10' },
  { icon: '👥', title: 'Community', desc: 'Feed social, follow, commenti', bg: 'bg-violet-500/10' },
]
