import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import { UserBadge } from '@/components/ui/UserBadge'
import { Users, MessageCircle, Heart, BookOpen, UserPlus, Flame, Clock, Sparkles, Compass, ListChecks } from 'lucide-react'

async function getCommunityData(userId: string) {
  const supabase = await createClient()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

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
      .limit(240),

    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, badge, created_at')
      .not('username', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('posts')
      .select('id, user_id, content, image_url, created_at, category, likes(id), comments(id), author:profiles!user_id(username, display_name, avatar_url, badge)')
      .gte('created_at', oneWeekAgo)
      .order('created_at', { ascending: false })
      .limit(240),

    supabase
      .from('user_lists')
      .select('id, title, description, created_at, owner:profiles!user_id(username, display_name, avatar_url)')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(8),

    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ])

  const followingIds = new Set((myFollows || []).map(f => f.following_id))
  followingIds.add(userId)

  const userActivityCount: Record<string, { count: number; profile: any }> = {}
  for (const row of activeUsersRaw || []) {
    if (!row.user_id || !row.profiles) continue
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (!profile?.username) continue
    if (!userActivityCount[row.user_id]) userActivityCount[row.user_id] = { count: 0, profile }
    userActivityCount[row.user_id].count++
  }

  const activeUsers = Object.entries(userActivityCount)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 18)
    .map(([id, { count, profile }]) => ({ id, count, profile }))

  const suggested = activeUsers.filter(u => !followingIds.has(u.id)).slice(0, 8)

  type RawPost = {
    id: string; user_id: string; content: string; image_url: string | null
    created_at: string; category: string | null
    likes: { id: string }[]; comments: { id: string }[]
    author: { username: string; display_name: string | null; avatar_url: string | null; badge?: string | null } | null
  }
  const engagingPosts = ((recentPosts || []) as unknown as RawPost[])
    .filter(p => !!p.author?.username)
    .map(p => ({
      ...p,
      likes_count: (p.likes || []).length,
      comments_count: (p.comments || []).length,
      score: (p.likes || []).length + (p.comments || []).length * 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  const freshMembers = (newMembers || []).filter(m => m.id !== userId && !!m.username).slice(0, 8)

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

function CommunityStat({ label, value, icon, accent = false }: { label: string; value: string | number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="gk-label">{label}</p>
        <span className={accent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>{icon}</span>
      </div>
      <p className={`font-mono-data text-[22px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}

function SectionTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[var(--accent)]">{icon}</span>
        <h2 className="gk-label">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export default async function CommunityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { suggested, engagingPosts, publicLists, freshMembers, totalCount, activeThisWeek } = await getCommunityData(user.id)

  return (
    <div className="gk-page-scaffold gk-community-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-28">
      <div className="mx-auto max-w-3xl px-4 pt-6 md:pt-10">
        <div className="mb-6 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.08),rgba(20,20,27,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
            <Sparkles size={12} />
            Community hub
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="gk-h1 mb-2">Le persone che danno vita a Geekore.</h1>
              <p className="gk-body max-w-2xl">Scopri utenti attivi, conversazioni, nuovi membri e liste pubbliche: la parte sociale che alimenta feed e raccomandazioni.</p>
            </div>
            <Link href="/friends" data-no-swipe="true" className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
              <UserPlus size={15} /> Trova amici
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
            <CommunityStat label="iscritti" value={totalCount.toLocaleString('it-IT')} accent icon={<Users size={14} />} />
            <CommunityStat label="attivi" value={activeThisWeek} icon={<Flame size={14} />} />
            <CommunityStat label="liste" value={publicLists.length} icon={<ListChecks size={14} />} />
          </div>
        </div>

        {suggested.length > 0 && (
          <section className="mb-8">
            <SectionTitle icon={<UserPlus size={16} />} title="Chi seguire" action={<Link data-no-swipe="true" href="/friends" className="gk-mono text-[var(--accent)]">vedi tutti</Link>} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {suggested.map(u => (
                <Link key={u.id} href={`/profile/${u.profile.username}`} data-no-swipe="true" className="group flex items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                  <Avatar src={u.profile.avatar_url} username={u.profile.username} displayName={u.profile.display_name} size={42} className="rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                      <UserBadge badge={(u.profile as any).badge} displayName={u.profile.display_name || u.profile.username} />
                    </p>
                    <p className="gk-mono truncate text-[var(--text-muted)]">@{u.profile.username}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full border border-orange-500/15 bg-orange-500/10 px-2 py-1 text-[11px] text-orange-300">
                    <Flame size={11} />{u.count}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {engagingPosts.length > 0 && (
          <section className="mb-8">
            <SectionTitle icon={<MessageCircle size={16} />} title="Conversazioni in corso" action={<Link data-no-swipe="true" href="/home" className="gk-mono text-[var(--accent)]">apri feed</Link>} />
            <div className="flex flex-col gap-2">
              {engagingPosts.map(post => (
                <Link key={post.id} href="/home" data-no-swipe="true" className="group flex gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                  <Avatar src={post.author?.avatar_url ?? undefined} username={post.author?.username ?? '?'} displayName={post.author?.display_name ?? undefined} size={38} className="rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                        <UserBadge badge={post.author?.badge} displayName={post.author?.display_name || post.author?.username || '?'} />
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">·</span>
                      <span className="flex-shrink-0 text-[11px] text-[var(--text-muted)]">{timeAgo(post.created_at)}</span>
                    </div>
                    <p className="line-clamp-2 text-[13px] leading-snug text-[var(--text-secondary)]">{truncate(post.content, 130)}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><Heart size={11} /> {post.likes_count}</span>
                      <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><MessageCircle size={11} /> {post.comments_count}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {freshMembers.length > 0 && (
          <section className="mb-8">
            <SectionTitle icon={<Clock size={16} />} title="Nuovi nella community" />
            <div className="flex flex-wrap gap-2">
              {freshMembers.map(m => (
                <Link key={m.id} href={`/profile/${m.username}`} data-no-swipe="true" className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                  <Avatar src={m.avatar_url} username={m.username} displayName={m.display_name ?? undefined} size={26} />
                  <span className="text-[13px] font-bold text-[var(--text-secondary)]"><UserBadge badge={(m as any).badge} displayName={m.display_name || m.username} /></span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {publicLists.length > 0 && (
          <section className="mb-8">
            <SectionTitle icon={<BookOpen size={16} />} title="Liste della community" action={<Link data-no-swipe="true" href="/lists" className="gk-mono text-[var(--accent)]">liste</Link>} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {publicLists.map((list: any) => (
                <Link key={list.id} href={`/lists/${list.id}`} data-no-swipe="true" className="group rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
                  <p className="mb-1 truncate text-[14px] font-black text-[var(--text-primary)] group-hover:text-[var(--accent)]">{list.title}</p>
                  {list.description && <p className="mb-3 line-clamp-2 text-[12px] text-[var(--text-muted)]">{list.description}</p>}
                  <div className="flex items-center gap-2">
                    <Avatar src={list.owner?.avatar_url} username={list.owner?.username ?? '?'} displayName={list.owner?.display_name ?? undefined} size={22} />
                    <span className="gk-mono truncate text-[var(--text-muted)]">@{list.owner?.username}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">·</span>
                    <span className="gk-mono text-[var(--text-muted)]">{timeAgo(list.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {suggested.length === 0 && engagingPosts.length === 0 && freshMembers.length === 0 && publicLists.length === 0 && (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
            <Compass size={30} className="mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="gk-headline mb-1 text-[var(--text-primary)]">Community ancora silenziosa</p>
            <p className="gk-body mx-auto max-w-sm">Pubblica nel feed, crea liste o segui nuovi utenti per animare questo hub.</p>
          </div>
        )}
      </div>
    </div>
  )
}
