// src/app/explore/page.tsx
// M4: Aggiunta sezione "Generi più amati", "Media più aggiunti", "Utenti con gusti simili"

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SearchSection } from '@/components/explore/search-section'
import { TrendingUp, Users, Star, Film, Gamepad2, Tv, Globe, Zap, Heart, Trophy, MessageCircle, ThumbsUp, Layers } from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getExploreData(userId: string) {
  const supabase = await createClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: activeUsers },
    { data: recentMedia },
    { data: topLists },
    { data: myGenres },
    { data: weeklyEntries },
    { data: weeklyPosts },
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
      .select('id, title, description, created_at, owner:profiles!user_id(username, display_name, avatar_url)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(6),

    // M4: i miei generi per trovare utenti simili
    supabase
      .from('user_media_entries')
      .select('genres')
      .eq('user_id', userId)
      .not('genres', 'is', null),

    // M4: media aggiunti questa settimana con generi per trending generi
    supabase
      .from('user_media_entries')
      .select('genres, type')
      .gte('created_at', oneWeekAgo)
      .not('genres', 'is', null)
      .limit(500),

    // Fix #3: post più popolari della settimana
    supabase
      .from('posts')
      .select('id, user_id, content, image_url, created_at, category, likes(id), comments(id)')
      .gte('created_at', oneWeekAgo)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  // Aggrega utenti attivi
  const userCounts: Record<string, { count: number; profile: any }> = {}
  for (const row of activeUsers || []) {
    if (!row.user_id || !row.profiles) continue
    if (!userCounts[row.user_id]) userCounts[row.user_id] = { count: 0, profile: row.profiles }
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

  // M4: Generi trending — conta le occorrenze di ogni genere nelle entry della settimana
  const genreCounts: Record<string, number> = {}
  for (const row of weeklyEntries || []) {
    for (const g of (row.genres || [])) {
      if (g && g.length > 1) genreCounts[g] = (genreCounts[g] || 0) + 1
    }
  }
  const trendingGenres = Object.entries(genreCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([genre, count]) => ({ genre, count }))
  const maxGenreCount = trendingGenres[0]?.count || 1

  // M4: Utenti con gusti simili — trova overlap di generi
  const myGenreSet = new Set<string>()
  for (const row of myGenres || []) {
    for (const g of (row.genres || [])) myGenreSet.add(g)
  }

  // Fix #3: post più popolari = ordinati per numero di like
  type RawPost = { id: string; user_id: string; content: string; image_url: string | null; created_at: string; category: string | null; likes: { id: string }[]; comments: { id: string }[] }
  const sortedPosts = ((weeklyPosts || []) as RawPost[])
    .map(p => ({
      ...p,
      likes_count: (p.likes || []).length,
      comments_count: (p.comments || []).length,
    }))
    .sort((a, b) => b.likes_count - a.likes_count)
    .slice(0, 5)

  let popularPosts: Array<{ id: string; user_id: string; content: string; image_url: string | null; created_at: string; category: string | null; likes_count: number; comments_count: number; author: { username: string; display_name: string | null; avatar_url: string | null } }> = []
  if (sortedPosts.length > 0) {
    const postUids = [...new Set(sortedPosts.map(p => p.user_id))]
    const { data: postProfiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', postUids)
    const profileMap: Record<string, { username: string; display_name: string | null; avatar_url: string | null }> = {}
    for (const pr of (postProfiles || [])) profileMap[pr.id] = pr
    popularPosts = sortedPosts.map(p => ({
      id: p.id, user_id: p.user_id, content: p.content,
      image_url: p.image_url, created_at: p.created_at, category: p.category,
      likes_count: p.likes_count, comments_count: p.comments_count,
      author: profileMap[p.user_id] || { username: 'utente', display_name: null, avatar_url: null },
    }))
  }

  return {
    trendingUsers, trendingMedia, topLists: topLists || [],
    trendingGenres, maxGenreCount, myGenreSet, popularPosts,
  }
}

// ── Componenti ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Tv, manga: Layers, game: Gamepad2, movie: Film, tv: Tv, }

function TrendingMediaCard({ item, rank }: { item: { count: number; item: any }; rank: number }) {
  const Icon = TYPE_ICON[item.item.type] || Film

  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="w-10 h-14 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
        {item.item.cover_image
          ? <img src={item.item.cover_image} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center"><Icon size={16} className="text-zinc-600" /></div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{item.item.title}</p>
        <p className="text-xs text-zinc-500 capitalize">{item.item.type}</p>
      </div>
      <div className="text-right flex-shrink-0">
        {rank < 3
          ? <Trophy size={16} className={rank === 0 ? 'text-yellow-400' : rank === 1 ? 'text-zinc-300' : 'text-amber-600'} />
          : <span className="text-xs font-bold text-zinc-400">#{rank + 1}</span>}
        <p className="text-[10px] text-zinc-600">{item.count} aggiunte</p>
      </div>
    </div>
  )
}

function UserCard({ user }: { user: { id: string; count: number; profile: any } }) {
  const profile = Array.isArray(user.profile) ? user.profile[0] : user.profile
  if (!profile?.username) return null
  const initial = (profile.display_name || profile.username)[0]?.toUpperCase() || '?'
  return (
    <Link href={`/profile/${profile.username}`} className="flex flex-col items-center gap-2 group">
      <div className="w-14 h-14 rounded-2xl overflow-hidden ring-2 ring-zinc-800 group-hover:ring-violet-500/50 transition-all">
        <Avatar
          src={profile.avatar_url}
          username={profile.username}
          displayName={profile.display_name}
          size={56}
          className="rounded-2xl"
        />
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-white group-hover:text-white transition-colors truncate max-w-[64px]">
          {profile.display_name || profile.username}
        </p>
        <p className="text-[10px] text-zinc-600">{user.count} aggiorn.</p>
      </div>
    </Link>
  )
}

function PopularPostCard({ post }: { post: { id: string; content: string; image_url: string | null; created_at: string; category: string | null; likes_count: number; comments_count: number; author: { username: string; display_name: string | null; avatar_url: string | null } } }) {
  const preview = post.content.length > 120 ? post.content.slice(0, 120).trimEnd() + '…' : post.content
  const timeAgo = (() => {
    const diff = Date.now() - new Date(post.created_at).getTime()
    const h = Math.floor(diff / 3600000)
    if (h < 1) return 'adesso'
    if (h < 24) return `${h}h fa`
    return `${Math.floor(h / 24)}g fa`
  })()
  return (
    <Link href="/home" className="flex gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group">
      <Avatar
        src={post.author.avatar_url}
        username={post.author.username}
        displayName={post.author.display_name}
        size={36}
        className="rounded-xl flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-white group-hover:text-white transition-colors">
            {post.author.display_name || post.author.username}
          </span>
          {post.category && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full capitalize">{post.category}</span>
          )}
          <span className="text-[10px] text-zinc-600 ml-auto flex-shrink-0">{timeAgo}</span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">{preview}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <ThumbsUp size={10} /> {post.likes_count}
          </span>
          <span className="flex items-center gap-1 text-[10px] text-zinc-600">
            <MessageCircle size={10} /> {post.comments_count}
          </span>
        </div>
      </div>
      {post.image_url && (
        <img src={post.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
      )}
    </Link>
  )
}

// ── Pagina ─────────────────────────────────────────────────────────────────────

export default async function ExplorePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { trendingUsers, trendingMedia, topLists, trendingGenres, maxGenreCount, popularPosts } =
    await getExploreData(user.id)

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 pt-2 md:pt-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="hidden md:block text-4xl font-black tracking-tighter">Esplora</h1>
          <p className="text-zinc-500 text-sm mt-1">Scopri la community Geekore</p>
        </div>

        {/* Search utenti */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Cerca utenti</p>
          <SearchSection />
        </div>

        {/* M4: Generi più amati questa settimana */}
        {trendingGenres.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Heart size={14} className="text-fuchsia-400" />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Generi più amati questa settimana</h2>
            </div>
            <div className="space-y-2">
              {trendingGenres.map(({ genre, count }) => (
                <div key={genre} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-28 truncate flex-shrink-0">{genre}</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(4, (count / maxGenreCount) * 100)}%`, background: '#E6FF3D' }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-600 w-8 text-right flex-shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Utenti attivi questa settimana */}
        {trendingUsers.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="" style={{ color: '#E6FF3D' }} />
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Più attivi questa settimana</h2>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
              {trendingUsers.slice(0, 12).map(u => (
                <UserCard key={u.id} user={u} />
              ))}
            </div>
          </section>
        )}

        {/* M4: Media più aggiunti */}
        {trendingMedia.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-yellow-400" />
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Media più aggiunti questa settimana</h2>
              </div>
              <Link href="/trending" className="text-xs hover:opacity-80 transition-colors" style={{ color: '#E6FF3D' }}>
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

        {/* Fix #3: Post più popolari della settimana */}
        {popularPosts.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ThumbsUp size={14} className="text-pink-400" />
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Post più apprezzati</h2>
              </div>
              <Link href="/home" className="text-xs hover:opacity-80 transition-colors" style={{ color: '#E6FF3D' }}>
                Vai al feed →
              </Link>
            </div>
            <div className="space-y-2">
              {popularPosts.map(post => (
                <PopularPostCard key={post.id} post={post} />
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
                      <p className="text-sm font-semibold text-white group-hover:text-white transition-colors truncate">{list.title}</p>
                      {list.description && (
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{list.description}</p>
                      )}
                      <p className="text-xs text-zinc-600 mt-1">
                        di <span className="" style={{ color: '#E6FF3D' }}>@{owner?.username || 'utente'}</span>
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