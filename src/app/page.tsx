// DESTINAZIONE: src/app/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) redirect('/feed')

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">

      {/* Nav minima */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M13 2L4.09 12.97 12 12l-1 9 8.91-10.97L12 11z"/>
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tighter">geekore</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-5 py-2 text-sm font-medium text-zinc-400 hover:text-white transition"
          >
            Accedi
          </Link>
          <Link
            href="/register"
            className="px-5 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-500 rounded-full transition"
          >
            Registrati
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-20">
        <div className="max-w-3xl mx-auto">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-sm font-medium mb-8">
            <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
            Il tuo universo geek in un unico posto
          </div>

          {/* Titolo */}
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none mb-6">
            Traccia tutto
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400">
              ciò che ami
            </span>
          </h1>

          {/* Descrizione */}
          <p className="text-xl text-zinc-400 mb-12 max-w-xl mx-auto leading-relaxed">
            Anime, manga, videogiochi, serie TV e film in un unico profilo.
            Condividi i tuoi progressi con la community.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="px-10 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-violet-500/20"
            >
              Registrati gratis
            </Link>
            <Link
              href="/login"
              className="px-10 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl font-bold text-lg transition-all"
            >
              Accedi
            </Link>
          </div>
        </div>

        {/* Mockup cards */}
        <div className="mt-24 max-w-4xl mx-auto w-full">
          <div className="relative">
            {/* Glow */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent z-10 pointer-events-none" />
            <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 rounded-3xl blur-xl" />

            {/* Card grid mockup */}
            <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 backdrop-blur">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {MOCK_CARDS.map((card, i) => (
                  <div
                    key={i}
                    className="bg-zinc-800/80 rounded-2xl overflow-hidden border border-zinc-700/50"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <div
                      className="h-36 w-full"
                      style={{ background: card.gradient }}
                    />
                    <div className="p-3">
                      <div className="text-xs font-semibold truncate">{card.title}</div>
                      <div className="text-xs text-zinc-500 mt-1">{card.type}</div>
                      <div className="flex gap-0.5 mt-2">
                        {[1,2,3,4,5].map(s => (
                          <svg key={s} width="10" height="10" viewBox="0 0 24 24">
                            <path
                              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                              fill={s <= card.stars ? '#fbbf24' : '#374151'}
                            />
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-3 justify-center mt-16">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-full text-sm text-zinc-400"
            >
              {f}
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-zinc-600 text-sm border-t border-zinc-900">
        Geekore — fatto con passione per i geek
      </footer>
    </div>
  )
}

const MOCK_CARDS = [
  { title: 'Attack on Titan', type: 'Anime', stars: 5, gradient: 'linear-gradient(135deg, #1a1a2e, #16213e)' },
  { title: 'Elden Ring', type: 'Videogioco', stars: 5, gradient: 'linear-gradient(135deg, #2d1b00, #1a0f00)' },
  { title: 'One Piece', type: 'Manga', stars: 4, gradient: 'linear-gradient(135deg, #001f3f, #003366)' },
  { title: 'Breaking Bad', type: 'Serie TV', stars: 5, gradient: 'linear-gradient(135deg, #1a2a1a, #0d1a0d)' },
]

const FEATURES = [
  'Anime & Manga',
  'Videogiochi',
  'Serie TV',
  'Film',
  'Board Game',
  'Integrazione Steam',
  'Progressi episodi',
  'Voti con stelle',
  'Feed social',
  'Profilo pubblico',
]