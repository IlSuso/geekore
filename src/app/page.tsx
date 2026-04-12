// src/app/page.tsx
// C1: Landing page con dati reali via Server Component + Suspense streaming
// Mostra: contatori community, ultimi iscritti, preview feed pubblico

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Avatar } from '@/components/ui/Avatar'

// ─── Fetch dati reali ─────────────────────────────────────────────────────────

async function getCommunityStats() {
  const supabase = await createClient()
  const [
    { count: userCount },
    { count: mediaCount },
    { data: recentUsers },
    { data: recentPosts },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('user_media_entries').select('*', { count: 'exact', head: true }),
    supabase.from('profiles')
      .select('username, display_name, avatar_url')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase.from('posts')
      .select('id, content, created_at, profiles(username, display_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(3),
  ])
  return {
    userCount: userCount || 0,
    mediaCount: mediaCount || 0,
    recentUsers: recentUsers || [],
    recentPosts: recentPosts || [],
  }
}

// ─── Contatori animati via CSS ────────────────────────────────────────────────

function AnimatedCounter({ value, label, suffix = '' }: { value: number; label: string; suffix?: string }) {
  const display = value >= 1000
    ? `${(value / 1000).toFixed(1)}k`
    : value.toString()
  return (
    <div className="text-center">
      <p className="text-4xl md:text-5xl font-black tracking-tighter text-white tabular-nums">
        {display}{suffix}
      </p>
      <p className="text-zinc-500 text-sm mt-1">{label}</p>
    </div>
  )
}

// ─── Community live section ───────────────────────────────────────────────────

async function CommunityLive() {
  const { userCount, mediaCount, recentUsers, recentPosts } = await getCommunityStats()

  return (
    <div className="mt-20 max-w-4xl mx-auto w-full space-y-10">

      {/* Contatori */}
      <div className="relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 rounded-3xl blur-xl" />
        <div className="relative bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 backdrop-blur">
          <div className="flex items-center gap-2 mb-8 justify-center">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <p className="text-sm font-medium text-zinc-400 uppercase tracking-widest">Community live</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
            <AnimatedCounter value={userCount} label="Geek iscritti" />
            <AnimatedCounter value={mediaCount} label="Media tracciati" />
            <div className="text-center col-span-2 md:col-span-1">
              <p className="text-4xl md:text-5xl font-black tracking-tighter text-white">5+</p>
              <p className="text-zinc-500 text-sm mt-1">Categorie supportate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Ultimi iscritti */}
      {recentUsers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-4 text-center">
            Entrati di recente
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            {recentUsers.map((u: any) => (
              <Link
                key={u.username}
                href={`/profile/${u.username}`}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-12 h-12 rounded-2xl overflow-hidden ring-2 ring-zinc-800 group-hover:ring-violet-500/50 transition-all">
                  <Avatar
                    src={u.avatar_url}
                    username={u.username}
                    displayName={u.display_name}
                    size={48}
                    className="rounded-2xl"
                  />
                </div>
                <p className="text-[10px] text-zinc-600 group-hover:text-zinc-400 transition-colors truncate max-w-[56px]">
                  @{u.username}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Preview feed pubblico */}
      {recentPosts.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-widest mb-4 text-center">
            Dal feed
          </p>
          {recentPosts.map((post: any) => (
            <div
              key={post.id}
              className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-left"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
                  <Avatar
                    src={post.profiles?.avatar_url}
                    username={post.profiles?.username || 'user'}
                    displayName={post.profiles?.display_name}
                    size={32}
                    className="rounded-xl"
                  />
                </div>
                <span className="text-xs font-semibold text-violet-400">
                  @{post.profiles?.username || 'utente'}
                </span>
              </div>
              <p className="text-sm text-zinc-300 line-clamp-2 leading-relaxed">
                {post.content}
              </p>
            </div>
          ))}
          <div className="text-center pt-2">
            <Link href="/register" className="text-xs text-zinc-600 hover:text-violet-400 transition-colors">
              Registrati per vedere il feed completo →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Skeleton per Suspense ────────────────────────────────────────────────────

function CommunityLiveSkeleton() {
  return (
    <div className="mt-20 max-w-4xl mx-auto w-full space-y-10 animate-pulse">
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8">
        <div className="grid grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="text-center space-y-2">
              <div className="h-12 bg-zinc-800 rounded-xl w-24 mx-auto" />
              <div className="h-4 bg-zinc-800 rounded-full w-20 mx-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-center gap-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-zinc-800 rounded-2xl" />
            <div className="h-2 bg-zinc-800 rounded-full w-10" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/feed')

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col -mt-16">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M13 2L4.09 12.97 12 12l-1 9 8.91-10.97L12 11z"/>
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tighter">geekore</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="px-5 py-2 text-sm font-medium text-zinc-400 hover:text-white transition">
            Accedi
          </Link>
          <Link href="/register" className="px-5 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-500 rounded-full transition">
            Registrati
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-20">
        <div className="max-w-3xl mx-auto">

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-400 text-sm font-medium mb-8">
            <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
            Il tuo universo geek in un unico posto
          </div>

          <h1 className="text-5xl md:text-8xl font-black tracking-tighter leading-none mb-6">
            Traccia tutto
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400">
              ciò che ami
            </span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 mb-12 max-w-xl mx-auto leading-relaxed">
            Anime, manga, videogiochi, serie TV e film in un unico profilo.
            Condividi i tuoi progressi con la community.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="px-10 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-violet-500/20">
              Registrati gratis
            </Link>
            <Link href="/login" className="px-10 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl font-bold text-lg transition-all">
              Accedi
            </Link>
          </div>
        </div>

        {/* C1: Dati reali con Suspense streaming — non rallenta TTFB */}
        <Suspense fallback={<CommunityLiveSkeleton />}>
          <CommunityLive />
        </Suspense>

        <div className="flex flex-wrap gap-2 md:gap-3 justify-center mt-12 md:mt-16">
          {FEATURES.map((f, i) => (
            <div key={i} className="px-3 md:px-4 py-1.5 md:py-2 bg-zinc-900 border border-zinc-800 rounded-full text-xs md:text-sm text-zinc-400">
              {f}
            </div>
          ))}
        </div>
      </main>

      <footer className="text-center py-6 text-zinc-600 text-sm border-t border-zinc-900">
        Geekore — fatto con passione per i geek
      </footer>
    </div>
  )
}

const FEATURES = [
  'Anime & Manga', 'Videogiochi', 'Serie TV', 'Film',
  'Board Game', 'Steam', 'Progressi', 'Feed social',
]
