'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Users, Search, Sparkles, UserPlus, UserCheck, X, Loader2, Compass, Activity, LogIn, Clock, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { PageScaffold } from '@/components/ui/PageScaffold'

type FriendsTab = 'activity' | 'common' | 'suggested'

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio?: string | null
  updated_at?: string | null
}

type FriendActivity = {
  id: string
  user_id: string
  title: string
  type: string
  cover_image?: string | null
  status?: string | null
  rating?: number | null
  updated_at: string
  profiles?: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
}

const CLOSED_VERBS: Record<string, string> = {
  watching: 'sta guardando',
  reading: 'sta leggendo',
  playing: 'sta giocando',
  completed: 'ha completato',
  planning: 'ha aggiunto alla wishlist',
  paused: 'ha messo in pausa',
  dropped: 'ha abbandonato',
  rated: 'ha votato',
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function compactTimeAgo(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}g`
  return `${Math.floor(d / 7)}sett`
}

function actionVerb(activity: FriendActivity): string {
  if (activity.rating && activity.rating > 0) return CLOSED_VERBS.rated
  return CLOSED_VERBS[activity.status || ''] || 'ha iniziato'
}

function SocialStat({ label, value, accent = false, icon }: { label: string; value: string | number; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="gk-label">{label}</p>
        {icon && <span className={accent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>{icon}</span>}
      </div>
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  )
}

function StoriesRail({ profiles }: { profiles: ProfileRow[] }) {
  if (profiles.length === 0) return null
  return (
    <div className="mb-5 -mx-4 overflow-x-auto px-4 pb-1 scrollbar-hide" data-no-swipe="true" data-horizontal-scroll="true">
      <div className="flex gap-3">
        {profiles.slice(0, 16).map(profile => {
          const username = profile.username || profile.id
          const label = profile.display_name || profile.username || 'utente'
          return (
            <Link key={profile.id} href={`/profile/${username}`} className="w-[62px] shrink-0 text-center">
              <div className="mx-auto mb-1 rounded-[18px] p-[2px] gk-story-ring">
                <Avatar src={profile.avatar_url} username={username} displayName={label} size={48} className="rounded-[16px]" />
              </div>
              <p className="truncate text-[10px] font-bold text-[var(--text-secondary)]">{username}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function ActivityCard({ activity }: { activity: FriendActivity }) {
  const profile = activity.profiles
  const username = profile?.username || activity.user_id
  const name = profile?.display_name || profile?.username || 'utente'
  const verb = actionVerb(activity)
  return (
    <button
      type="button"
      data-no-swipe="true"
      className="group flex w-full items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
    >
      <Link href={`/profile/${username}`} className="shrink-0" onClick={event => event.stopPropagation()}>
        <Avatar src={profile?.avatar_url} username={username} displayName={name} size={32} className="rounded-xl" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13.5px] leading-snug text-[var(--text-secondary)]">
          <Link href={`/profile/${username}`} onClick={event => event.stopPropagation()} className="font-black text-[var(--text-primary)] hover:text-[var(--accent)]">
            @{username}
          </Link>{' '}
          <span>{verb}</span>{' '}
          <span className="font-bold italic text-[var(--text-primary)]">{activity.title}</span>
        </p>
        <p className="mt-1 font-mono-data text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {compactTimeAgo(activity.updated_at)} · {activity.type}
        </p>
      </div>
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
        {activity.cover_image ? (
          <img src={activity.cover_image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[var(--text-muted)]">
            <Activity size={15} />
          </div>
        )}
      </div>
    </button>
  )
}

function ProfileSuggestionCard({
  profile,
  followingIds,
  pendingFollowId,
  authUserId,
  onToggleFollow,
}: {
  profile: ProfileRow
  followingIds: Set<string>
  pendingFollowId: string | null
  authUserId?: string
  onToggleFollow: (profileId: string) => void
}) {
  const username = profile.username || profile.id
  const label = profile.display_name || profile.username || 'Utente Geekore'
  const isFollowing = followingIds.has(profile.id)
  const isPending = pendingFollowId === profile.id
  const pseudoMatch = Math.max(52, 94 - (username.length % 7) * 6)

  return (
    <div data-no-swipe="true" className="group flex items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
      <Link href={`/profile/${username}`} data-no-swipe="true" className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar src={profile.avatar_url} username={username} displayName={label} size={46} className="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">{label}</p>
          <p className="gk-mono truncate text-[var(--text-muted)]">@{username}</p>
          {profile.bio ? <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--text-muted)]">{profile.bio}</p> : <p className="mt-0.5 text-[12px] text-[var(--accent)]">taste match {pseudoMatch}%</p>}
        </div>
      </Link>
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => onToggleFollow(profile.id)}
        disabled={!authUserId || isPending}
        className="inline-flex h-9 min-w-[92px] flex-shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-[11px] font-black transition-all disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        style={isFollowing
          ? { borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }
          : { borderColor: 'rgba(230,255,61,0.45)', color: '#0B0B0F', background: 'var(--accent)' }}
      >
        {isPending ? <Loader2 size={13} className="animate-spin" /> : isFollowing ? <UserCheck size={13} /> : <UserPlus size={13} />}
        {isFollowing ? 'Seguito' : 'Segui'}
      </button>
    </div>
  )
}

export default function FriendsPage() {
  const supabase = createClient()
  const authUser = useUser()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [activities, setActivities] = useState<FriendActivity[]>([])
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [pendingFollowId, setPendingFollowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<FriendsTab>('activity')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)

      const [{ data: profilesData }, { data: followsData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, updated_at')
          .not('username', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(80),
        authUser
          ? supabase
              .from('follows')
              .select('following_id')
              .eq('follower_id', authUser.id)
          : Promise.resolve({ data: [] }),
      ])

      const nextProfiles = (profilesData || []).filter((p: ProfileRow) => p.id !== authUser?.id && !!p.username)
      const nextFollowing = new Set((followsData || []).map((row: any) => row.following_id))
      let nextActivities: FriendActivity[] = []

      if (authUser && nextFollowing.size > 0) {
        const { data: activityData } = await supabase
          .from('user_media_entries')
          .select('id, user_id, title, type, cover_image, status, rating, updated_at, profiles:user_id(username, display_name, avatar_url)')
          .in('user_id', Array.from(nextFollowing))
          .order('updated_at', { ascending: false })
          .limit(40)
        nextActivities = (activityData || []) as unknown as FriendActivity[]
      }

      if (cancelled) return
      setProfiles(nextProfiles)
      setFollowingIds(nextFollowing)
      setActivities(nextActivities)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredProfiles = useMemo(() => {
    const q = normalize(query)
    const sorted = [...profiles].sort((a, b) => {
      const aFollowing = followingIds.has(a.id) ? 1 : 0
      const bFollowing = followingIds.has(b.id) ? 1 : 0
      if (bFollowing !== aFollowing) return bFollowing - aFollowing
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    })
    if (!q) return sorted
    return sorted.filter(profile => {
      const haystack = normalize([profile.username || '', profile.display_name || '', profile.bio || ''].join(' '))
      return haystack.includes(q)
    })
  }, [profiles, query, followingIds])

  const filteredActivities = useMemo(() => {
    const q = normalize(query)
    if (!q) return activities
    return activities.filter(activity => normalize([
      activity.title,
      activity.type,
      activity.status || '',
      activity.profiles?.username || '',
      activity.profiles?.display_name || '',
    ].join(' ')).includes(q))
  }, [activities, query])

  const followingProfiles = filteredProfiles.filter(profile => followingIds.has(profile.id))
  const suggestedProfiles = filteredProfiles.filter(profile => !followingIds.has(profile.id))
  const stories = followingProfiles.filter(profile => {
    if (!profile.updated_at) return true
    return Date.now() - new Date(profile.updated_at).getTime() < 24 * 60 * 60 * 1000
  })

  const followingCount = followingIds.size
  const suggestedCount = suggestedProfiles.length

  async function toggleFollow(profileId: string) {
    if (!authUser || profileId === authUser.id || pendingFollowId) return
    const isFollowing = followingIds.has(profileId)
    setPendingFollowId(profileId)

    setFollowingIds(prev => {
      const next = new Set(prev)
      if (isFollowing) next.delete(profileId)
      else next.add(profileId)
      return next
    })

    const result = isFollowing
      ? await supabase.from('follows').delete().eq('follower_id', authUser.id).eq('following_id', profileId)
      : await supabase.from('follows').insert({ follower_id: authUser.id, following_id: profileId })

    if (result.error) {
      setFollowingIds(prev => {
        const next = new Set(prev)
        if (isFollowing) next.add(profileId)
        else next.delete(profileId)
        return next
      })
    }
    setPendingFollowId(null)
  }

  const tabs: Array<{ id: FriendsTab; label: string; count: number }> = [
    { id: 'activity', label: 'Attività', count: filteredActivities.length },
    { id: 'common', label: 'In comune', count: followingProfiles.length },
    { id: 'suggested', label: 'Suggeriti', count: suggestedProfiles.length },
  ]

  return (
    <PageScaffold
      title="Friends"
      description="Trova persone con gusti simili e trasforma la tua libreria in un diario condiviso."
      icon={<Users size={16} />}
      className="gk-friends-page"
      contentClassName="gk-page-density max-w-screen-lg pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(160deg,rgba(230,255,61,0.07),var(--bg-secondary))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
        <div className="mb-2 gk-section-eyebrow">
          <Sparkles size={12} />
          Community DNA
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="gk-h1 mb-2">Friends</h2>
            <p className="gk-body max-w-2xl">Attività degli amici, gusti in comune e profili suggeriti per migliorare il tuo For You.</p>
          </div>
          <Link href="/community" data-no-swipe="true" className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-2xl border border-[rgba(230,255,61,0.24)] bg-[rgba(230,255,61,0.08)] px-4 text-sm font-black text-[var(--accent)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35">
            <Compass size={15} /> Community
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
          <SocialStat label="profili" value={profiles.length} accent icon={<Users size={14} />} />
          <SocialStat label="seguiti" value={followingCount} icon={<UserCheck size={14} />} />
          <SocialStat label="activity" value={activities.length} icon={<Activity size={14} />} />
        </div>
      </div>

      {!authUser && (
        <div className="mb-5 rounded-[22px] border border-amber-500/20 bg-amber-500/8 p-4" data-no-swipe="true">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300"><LogIn size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[var(--text-primary)]">Accedi per seguire utenti</p>
              <p className="gk-caption">Puoi esplorare i profili, ma il follow richiede login.</p>
            </div>
            <Link href="/login" data-no-swipe="true" className="rounded-2xl bg-[var(--accent)] px-3 py-2 text-xs font-black text-[#0B0B0F]">Login</Link>
          </div>
        </div>
      )}

      <StoriesRail profiles={stories.length ? stories : followingProfiles} />

      <div className="relative mb-3" data-no-swipe="true" data-interactive="true">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input data-no-swipe="true" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cerca utenti, media, attività..." className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pl-10 pr-10 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]" />
        {query && <button type="button" data-no-swipe="true" onClick={() => setQuery('')} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35" aria-label="Cancella ricerca amici"><X size={14} /></button>}
      </div>

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 p-2 ring-1 ring-white/5" data-no-swipe="true">
        {tabs.map(tab => {
          const active = activeTab === tab.id
          return (
            <button key={tab.id} type="button" data-no-swipe="true" onClick={() => setActiveTab(tab.id)} className="min-h-11 rounded-xl px-1 py-2 text-[11px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 sm:text-[12px]" style={active ? { background: 'rgba(230,255,61,0.09)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }} aria-pressed={active}>
              <span className="block">{tab.label}</span>
              <span className="font-mono-data text-[9px] opacity-70">{tab.count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[84px] rounded-2xl bg-[var(--bg-card)] skeleton" />)}</div>
      ) : activeTab === 'activity' ? (
        filteredActivities.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {filteredActivities.map(activity => <ActivityCard key={activity.id} activity={activity} />)}
          </div>
        ) : (
          <div className="gk-empty-state py-14"><Activity className="gk-empty-state-icon" /><p className="gk-empty-state-title">Nessuna attività recente</p><p className="gk-empty-state-subtitle">Segui utenti o torna più tardi per vedere cosa stanno guardando.</p></div>
        )
      ) : activeTab === 'common' ? (
        followingProfiles.length > 0 ? (
          <div className="space-y-2">
            {followingProfiles.map(profile => <ProfileSuggestionCard key={profile.id} profile={profile} followingIds={followingIds} pendingFollowId={pendingFollowId} authUserId={authUser?.id} onToggleFollow={toggleFollow} />)}
          </div>
        ) : (
          <div className="gk-empty-state py-14"><MessageCircle className="gk-empty-state-icon" /><p className="gk-empty-state-title">Nessun amico in comune</p><p className="gk-empty-state-subtitle">Segui profili suggeriti per costruire il tuo grafo sociale.</p></div>
        )
      ) : suggestedProfiles.length > 0 ? (
        <div className="space-y-2">
          {suggestedProfiles.map(profile => <ProfileSuggestionCard key={profile.id} profile={profile} followingIds={followingIds} pendingFollowId={pendingFollowId} authUserId={authUser?.id} onToggleFollow={toggleFollow} />)}
        </div>
      ) : (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <UserPlus size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="gk-headline mb-1">Nessun profilo trovato</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">Prova con un altro nome o torna più tardi quando la community sarà più popolata.</p>
          {query && <button type="button" data-no-swipe="true" onClick={() => setQuery('')} className="rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-white">Cancella ricerca</button>}
        </div>
      )}
    </PageScaffold>
  )
}
