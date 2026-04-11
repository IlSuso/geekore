// src/app/explore/page.tsx
// Pagina Esplora: utenti trending, collezioni pubbliche, statistiche community.
// Server Component con dati freschi.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SearchSection } from '@/components/explore/search-section'
import { TrendingUp, Users, Star, Film, Gamepad2, BookOpen, Tv, Globe } from 'lucide-react'
import Link from 'next/link'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getExploreData() {
  const supabase = await createClient()

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: activeUsers },
    { data: recentMedia },
    { data: topLists },
  ] = await Promise.all([
    supabase
      .from('activity_log')
      .select('user_id, profiles!user_id(username, display_name, avatar_url)')
      .gte('created_at', oneWeekAgo)
      .limit(100),

    supabase
      .from('user_media_entries')
      .select('title, type, cover_image, external_id')
      .gte('created_at', oneWeekAgo)
      .not('cover_image', 'is', null)
      .limit(200),

    supabase
      .from('user_lists')
      .select(`
        id, title, description, created_at,
        owner:profiles!user_id(username, display_name, avatar_url)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  // Aggrega utenti attivi
  const userCounts: Record<string, { count: number; profile: any }> = {}
  for (const row of activeUsers || []) {
    if (!row.user_id || !row.profiles) continue
    if (!userCounts[row.user_id]) {
      userCounts[row.user_id] = { count: 0, profile: row.profiles }
    }
    userCounts[row.user_id].count++
  }
  const trendingUsers = Object.entries(userCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 12)
    .map(([id, { count, profile }]) => ({ id, count, profile }))

  // Aggrega media trending
  const mediaCounts: Record<string, { count: number; item: any }> = {}
  for (const row of recentMedia || []) {
    const key = `${row.type}::${row.title}`
    if (!mediaCounts[key]) mediaCounts[key] = { count: 0, item: row }
    mediaCounts[key].count++
  }
  const trendingMedia = Object.values(mediaCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return { trendingUsers, trendingMedia, topLists: topLists || [] }
}

// ── Componenti ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Tv, manga: BookOpen, game: Gamepad2, movie: Film, tv: Tv, boardgame: Film,
}

const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500', boardgame: 'bg-yellow-500',
}

function TrendingMediaCard({ item, rank }: { item: { count: number; item: any }; rank: number }) {
  const Icon = TYPE_ICON[item.item.type] || Film
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors">
      <div className="w-6 text-center flex-shrink-0">
        {rank < 3
          ? <span className="text-sm">{['🥇','🥈','🥉'][rank]}</span>
          : <span className="text-xs font-bold text-zinc-600">#{rank+1}</span>}
      </div>
      <div className="w-10 h-14 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0">
        {item.item.cover_image
          ? <img src={item.item.cover_image} alt={item.item.title} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><Icon size={16} className="text-zinc-600" /></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.item.title}</p>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${TYPE_COLOR[item.item.type] || 'bg-zinc-600'}`}>
          {item.item.type}
        </span>
      </div>
      <div className="flex items-center gap-1 text-emerald-400 flex-shrink-0">
        <Users size={11} />
        <span className="text-xs font-bold">{item.count}</span>
      </div>
    </div>
  )
}

function UserCard({ user }: { user: { id: string; count: number; profile: any } }) {
  const profile = Array.isArray(user.profile) ? user.profile[0] : user.profile
  if (!profile?.username) return null
  const initial = (profile.display_name?.[0] || profile.username?.[0] || '?').toUpperCase()

  return (
    <Link href={`/profile/${profile.username}`} className="flex flex-col items-center gap-2 group">
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 ring-2 ring-transparent group-hover:ring-violet-500/50 transition-all">
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold text-lg">{initial}</div>
        }
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-white group-hover:text-violet-400 transition-colors truncate max-w-[80px]">
          {profile.display_name || profile.username}
        </p>
        <p className="text-[10px] text-zinc-600">{user.count} aggiornamenti</p>
      </div>
    </Link>
  )
}

// ── Pagina ─────────────────────────────────────────────────────────────────────

export default async function ExplorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { trendingUsers, trendingMedia, topLists } = await getExploreData()

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tighter">Esplora</h1>
          <p className="text-zinc-500 text-sm mt-1">Scopri la community Geekore</p>
        </div>

        {/* Search utenti */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Cerca utenti</p>
          <SearchSection />
        </div>

        {/* Utenti attivi questa settimana */}
        {trendingUsers.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-violet-400" />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Più attivi questa settimana</h2>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
              {trendingUsers.slice(0, 12).map(u => (
                <UserCard key={u.id} user={u} />
              ))}
            </div>
          </section>
        )}

        {/* Media trending */}
        {trendingMedia.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star size={14} className="text-yellow-400" />
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Più aggiunti questa settimana</h2>
              </div>
              <Link href="/trending" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                Vedi tutti →
              </Link>
            </div>
            <div className="space-y-2">
              {trendingMedia.slice(0, 6).map((item, i) => (
                <TrendingMediaCard key={`${item.item.type}-${item.item.title}`} item={item} rank={i} />
              ))}
            </div>
          </section>
        )}

        {/* Liste pubbliche recenti */}
        {topLists.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Globe size={14} className="text-emerald-400" />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Liste recenti della community</h2>
            </div>
            <div className="space-y-3">
              {topLists.map((list: any) => {
                const owner = Array.isArray(list.owner) ? list.owner[0] : list.owner
                return (
                  <Link
                    key={list.id}
                    href={`/lists/${list.id}`}
                    className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white group-hover:text-violet-300 transition-colors truncate">{list.title}</p>
                      {list.description && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{list.description}</p>
                      )}
                      <p className="text-xs text-zinc-600 mt-1">
                        di{' '}
                        <span className="text-violet-400">@{owner?.username || 'utente'}</span>
                      </p>
                    </div>
                    <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0">→</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {trendingUsers.length === 0 && trendingMedia.length === 0 && (
          <div className="text-center py-20 text-zinc-600">
            <Globe size={48} className="mx-auto mb-4 opacity-20" />
            <p>La community si sta popolando...</p>
            <p className="text-sm mt-1">Sii tra i primi ad aggiungere qualcosa!</p>
          </div>
        )}
      </div>
    </div>
  )
}