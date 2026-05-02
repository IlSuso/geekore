'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Users, Search, Sparkles, UserPlus, UserCheck, X, Loader2, Compass, Activity, LogIn } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import { PageScaffold } from '@/components/ui/PageScaffold'

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio?: string | null
  updated_at?: string | null
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
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

export default function FriendsPage() {
  const supabase = createClient()
  const authUser = useUser()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [pendingFollowId, setPendingFollowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

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

      if (cancelled) return
      setProfiles((profilesData || []).filter((p: ProfileRow) => p.id !== authUser?.id && !!p.username))
      setFollowingIds(new Set((followsData || []).map((row: any) => row.following_id)))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = normalize(query)
    const sorted = [...profiles].sort((a, b) => {
      const aFollowing = followingIds.has(a.id) ? 1 : 0
      const bFollowing = followingIds.has(b.id) ? 1 : 0
      if (bFollowing !== aFollowing) return bFollowing - aFollowing
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    })
    if (!q) return sorted
    return sorted.filter(profile => {
      const haystack = normalize([
        profile.username || '',
        profile.display_name || '',
        profile.bio || '',
      ].join(' '))
      return haystack.includes(q)
    })
  }, [profiles, query, followingIds])

  const followingCount = followingIds.size
  const visibleFollowingCount = filtered.filter(profile => followingIds.has(profile.id)).length
  const suggestedCount = filtered.filter(profile => !followingIds.has(profile.id)).length

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
      ? await supabase
          .from('follows')
          .delete()
          .eq('follower_id', authUser.id)
          .eq('following_id', profileId)
      : await supabase
          .from('follows')
          .insert({ follower_id: authUser.id, following_id: profileId })

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

  return (
    <PageScaffold
      title="Friends"
      description="Trova persone con gusti simili e trasforma la tua libreria in un diario condiviso."
      icon={<Users size={16} />}
      contentClassName="max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(139,92,246,0.13),rgba(230,255,61,0.07),rgba(20,20,27,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
          <Sparkles size={12} />
          Community DNA
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="gk-h1 mb-2">Segui chi sta consumando il tuo stesso universo.</h2>
            <p className="gk-body max-w-2xl">
              Friends diventa la base sociale di Geekore: profili suggeriti, follow diretto e segnali social per migliorare For You.
            </p>
          </div>
          <Link
            href="/community"
            data-no-swipe="true"
            className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-2xl border border-[rgba(230,255,61,0.24)] bg-[rgba(230,255,61,0.08)] px-4 text-sm font-black text-[var(--accent)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
          >
            <Compass size={15} />
            Community
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
          <SocialStat label="profili" value={profiles.length} accent icon={<Users size={14} />} />
          <SocialStat label="seguiti" value={followingCount} icon={<UserCheck size={14} />} />
          <SocialStat label="suggeriti" value={suggestedCount} icon={<UserPlus size={14} />} />
        </div>
      </div>

      {!authUser && (
        <div className="mb-5 rounded-[22px] border border-amber-500/20 bg-amber-500/8 p-4" data-no-swipe="true">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
              <LogIn size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[var(--text-primary)]">Accedi per seguire utenti</p>
              <p className="gk-caption">Puoi esplorare i profili, ma il follow richiede login.</p>
            </div>
            <Link href="/login" data-no-swipe="true" className="rounded-2xl bg-[var(--accent)] px-3 py-2 text-xs font-black text-[#0B0B0F]">Login</Link>
          </div>
        </div>
      )}

      <div className="relative mb-5" data-no-swipe="true" data-interactive="true">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          data-no-swipe="true"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Cerca utenti, gusti, bio..."
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pl-10 pr-10 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
        />
        {query && (
          <button
            type="button"
            data-no-swipe="true"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            aria-label="Cancella ricerca amici"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-[84px] rounded-2xl bg-[var(--bg-card)] skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <UserPlus size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="gk-headline mb-1">Nessun profilo trovato</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">Prova con un altro nome o torna più tardi quando la community sarà più popolata.</p>
          {query && (
            <button type="button" data-no-swipe="true" onClick={() => setQuery('')} className="rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-white">
              Cancella ricerca
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(profile => {
            const username = profile.username || profile.id
            const label = profile.display_name || profile.username || 'Utente Geekore'
            const isFollowing = followingIds.has(profile.id)
            const isPending = pendingFollowId === profile.id
            return (
              <div
                key={profile.id}
                data-no-swipe="true"
                className="group flex items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
              >
                <Link href={`/profile/${username}`} data-no-swipe="true" className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={profile.avatar_url} username={username} displayName={label} size={46} className="rounded-2xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-black text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">{label}</p>
                    <p className="gk-mono truncate text-[var(--text-muted)]">@{username}</p>
                    {profile.bio && <p className="mt-0.5 line-clamp-1 text-[12px] text-[var(--text-muted)]">{profile.bio}</p>}
                  </div>
                </Link>
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={() => toggleFollow(profile.id)}
                  disabled={!authUser || isPending}
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
          })}
        </div>
      )}
    </PageScaffold>
  )
}
