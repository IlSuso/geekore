'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Users, Search, Sparkles, UserPlus } from 'lucide-react'
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
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export default function FriendsPage() {
  const supabase = createClient()
  const authUser = useUser()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .not('username', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(40)

      if (cancelled) return
      setProfiles((data || []).filter((p: ProfileRow) => p.id !== authUser?.id))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [authUser?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return profiles
    return profiles.filter(profile => {
      const haystack = normalize([
        profile.username || '',
        profile.display_name || '',
        profile.bio || '',
      ].join(' '))
      return haystack.includes(q)
    })
  }, [profiles, query])

  return (
    <PageScaffold
      title="Friends"
      description="Trova persone con gusti simili e trasforma la tua libreria in un diario condiviso."
      icon={<Users size={16} />}
      contentClassName="max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(139,92,246,0.12),rgba(230,255,61,0.04))] p-4">
        <div className="mb-2 flex items-center gap-2 gk-label text-[var(--accent)]">
          <Sparkles size={13} />
          Community DNA
        </div>
        <h2 className="gk-title mb-2">Segui chi sta consumando il tuo stesso universo.</h2>
        <p className="gk-body max-w-none">
          Questa tab prepara la nuova area sociale della roadmap: amici attivi, profili suggeriti e activity legata a media reali.
        </p>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Cerca utenti, gusti, bio..."
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pl-10 pr-4 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(230,255,61,0.45)]"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-[72px] rounded-2xl bg-[var(--bg-card)] skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
          <UserPlus size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="gk-headline mb-1">Nessun profilo trovato</p>
          <p className="gk-body mx-auto max-w-sm">Prova con un altro nome o torna più tardi quando la community sarà più popolata.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(profile => {
            const username = profile.username || profile.id
            const label = profile.display_name || profile.username || 'Utente Geekore'
            return (
              <Link
                key={profile.id}
                href={`/profile/${username}`}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-colors hover:bg-[var(--bg-card-hover)]"
              >
                <Avatar src={profile.avatar_url} username={username} displayName={label} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="gk-headline truncate text-[15px]">{label}</p>
                  <p className="gk-mono truncate text-[var(--text-muted)]">@{username}</p>
                </div>
                <span className="rounded-full border border-[rgba(230,255,61,0.4)] px-3 py-1 text-[11px] font-bold text-[var(--accent)]">
                  Apri
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </PageScaffold>
  )
}
