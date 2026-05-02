import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { UserBadge } from '@/components/ui/UserBadge'
import { Users, MessageCircle, Heart, BookOpen, UserPlus, Flame, Clock } from 'lucide-react'

async function getCommunityData(userId: string) {
  const supabase = await createClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const oneDayAgo  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: myFollows },
    { data: activeUsersRaw },
    { data: newMembers },
    { data: recentPosts },
    { data: publicLists },
    { count: totalProfilesCount },
  ] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', userId),

    supabase
      .from('activity_log')
      .select('user_id, profiles!user_id(id, username, display_name, avatar_url, badge)')
      .gte('created_at', oneWeekAgo)
      .limit(200),

    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, badge, created_at')
      .order('created_at', { ascending: false })
      .limit(8),

    supabase
      .from('posts')
      .select('id, user_id, content, image_url, created_at, category, likes(id), comments(id), author:profiles!user_id(username, display_name, avatar_url, badge)')
      .gte('created_at', oneWeekAgo)
      .order('created_at', { ascending: false })
      .limit(200),

    supabase
      .from('user_lists')
      .select('id, title, description, created_at, owner:profiles!user_id(username, display_name, avatar_url)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(6),

    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ])

  const followingIds = new Set((myFollows || []).map(f => f.following_id))
  followingIds.add(userId)

  // Aggregate active users
  const userActivityCount: Record<string, { count: number; profile: any }> = {}
  for (const row of activeUsersRaw || []) {
    if (!row.user_id || !row.profiles) continue
    if (!userActivityCount[row.user_id]) userActivityCount[row.user_id] = { count: 0, profile: row.profiles }
    userActivityCount[row.user_id].count++
  }
  const activeUsers = Object.entries(userActivityCount)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 16)
    .map(([id, { count, profile }]) => ({ id, count, profile }))

  // Suggested: active users not followed
  const suggested = activeUsers
    .filter(u => !followingIds.has(u.id))
    .slice(0, 8)

  // Posts sorted by engagement (likes + comments)
  type RawPost = {
    id: string; user_id: string; content: string; image_url: string | null
    created_at: string; category: string | null
    likes: { id: string }[]; comments: { id: string }[]
    author: { username: string; display_name: string | null; avatar_url: string | null; badge?: string | null } | null
  }
  const engagingPosts = ((recentPosts || []) as unknown as RawPost[])
    .map(p => ({
      ...p,
      likes_count: (p.likes || []).length,
      comments_count: (p.comments || []).length,
      score: (p.likes || []).length + (p.comments || []).length * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  // New members (exclude self, already-following, exclude users with no recent activity if possible)
  const freshMembers = (newMembers || []).filter(m => m.id !== userId).slice(0, 6)

  return {
    suggested,
    engagingPosts,
    publicLists: publicLists || [],
    freshMembers,
    totalCount: totalProfilesCount ?? 0,
    activeThisWeek: activeUsers.length,
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'ora'
  if (h < 24) return `${h}h fa`
  return `${Math.floor(h / 24)}g fa`
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

export default async function CommunityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { suggested, engagingPosts, publicLists, freshMembers, totalCount, activeThisWeek } = await getCommunityData(user.id)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6 md:pt-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
              <Users size={20} className="text-black" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Community</h1>
          </div>
          <p className="text-zinc-500 text-sm pl-[52px]">Le persone che danno vita a Geekore</p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(230,255,61,0.1)' }}>
              <Users size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-xl font-bold text-white leading-none">{totalCount.toLocaleString('it-IT')}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Iscritti</p>
            </div>
          </div>
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 flex items-center justify-center flex-shrink-0">
              <Flame size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white leading-none">{activeThisWeek}</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Attivi questa settimana</p>
            </div>
          </div>
        </div>

        {/* Chi seguire */}
        {suggested.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserPlus size={16} style={{ color: 'var(--accent)' }} />
                <h2 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">Chi seguire</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggested.map(u => (
                <Link
                  key={u.id}
                  href={`/profile/${u.profile.username}`}
                  className="flex items-center gap-3 p-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-zinc-700 flex-shrink-0">
                    <Avatar
                      src={u.profile.avatar_url}
                      username={u.profile.username}
                      displayName={u.profile.display_name}
                      size={40}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white truncate group-hover:text-white transition-colors">
                      <UserBadge badge={(u.profile as any).badge} displayName={u.profile.display_name || u.profile.username} />
                    </p>
                    <p className="text-[12px] text-zinc-500 truncate">@{u.profile.username}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 text-[11px] text-zinc-600">
                    <Flame size={11} className="text-orange-400/70" />
                    <span>{u.count}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Post più discussi */}
        {engagingPosts.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle size={16} style={{ color: 'var(--accent)' }} />
              <h2 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">Conversazioni in corso</h2>
            </div>
            <div className="flex flex-col gap-2">
              {engagingPosts.map(post => (
                <Link
                  key={post.id}
                  href="/home"
                  className="flex gap-3 p-3 bg-zinc-900/60 border border-zinc-800 rounded-2xl hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-zinc-700 flex-shrink-0 mt-0.5">
                    <Avatar
                      src={post.author?.avatar_url ?? undefined}
                      username={post.author?.username ?? '?'}
                      displayName={post.author?.display_name ?? undefined}
                      size={36}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[13px] font-semibold text-white group-hover:text-white transition-colors truncate">
                        <UserBadge badge={post.author?.badge} displayName={post.author?.display_name || post.author?.username || '?'} />
                      </span>
                      <span className="text-zinc-600 text-[11px]">·</span>
                      <span className="text-zinc-600 text-[11px] flex-shrink-0">{timeAgo(post.created_at)}</span>
                    </div>
                    <p className="text-[13px] text-zinc-400 line-clamp-2 leading-snug">
                      {truncate(post.content, 120)}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                        <Heart size={11} /> {post.likes_count}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                        <MessageCircle size={11} /> {post.comments_count}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Nuovi nella community */}
        {freshMembers.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={16} className="text-sky-400" />
              <h2 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">Nuovi nella community</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {freshMembers.map(m => (
                <Link
                  key={m.id}
                  href={`/profile/${m.username}`}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-full hover:border-zinc-600 hover:bg-zinc-900 transition-all"
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    <Avatar src={m.avatar_url} username={m.username} displayName={m.display_name ?? undefined} size={24} />
                  </div>
                  <span className="text-[13px] text-zinc-300 font-medium"><UserBadge badge={(m as any).badge} displayName={m.display_name || m.username} /></span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Liste pubbliche */}
        {publicLists.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={16} className="text-amber-400" />
              <h2 className="text-[13px] font-semibold text-zinc-400 uppercase tracking-wider">Liste della community</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {publicLists.map((list: any) => (
                <Link
                  key={list.id}
                  href={`/lists/${list.id}`}
                  className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
                >
                  <p className="text-[14px] font-semibold text-white mb-1 group-hover:text-white transition-colors truncate">
                    {list.title}
                  </p>
                  {list.description && (
                    <p className="text-[12px] text-zinc-500 line-clamp-2 mb-2">{list.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full overflow-hidden">
                      <Avatar
                        src={list.owner?.avatar_url}
                        username={list.owner?.username ?? '?'}
                        displayName={list.owner?.display_name ?? undefined}
                        size={20}
                      />
                    </div>
                    <span className="text-[11px] text-zinc-600">@{list.owner?.username}</span>
                    <span className="text-zinc-700 text-[11px]">·</span>
                    <span className="text-[11px] text-zinc-600">{timeAgo(list.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
