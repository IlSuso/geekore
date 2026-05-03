'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Bookmark, Calendar, Swords, Gamepad2, Film, Tv,
  Trash2, Loader2, CheckCircle2, Layers, Search,
} from 'lucide-react'
import { getMediaTypeColor, getMediaTypeLabel } from '@/lib/mediaTypes'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { PageScaffold } from '@/components/ui/PageScaffold'

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Swords,
  manga: Layers,
  game: Gamepad2,
  movie: Film,
  tv: Tv,
}

function daysUntil(dateStr: string | null): { label: string; available: boolean } {
  if (!dateStr) return { label: '', available: false }
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return { label: 'Disponibile ora', available: true }
  if (diff === 1) return { label: 'Domani', available: false }
  if (diff < 30) return { label: `tra ${diff} giorni`, available: false }
  return {
    label: new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }),
    available: false,
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function WishlistStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

export default function WishlistPage() {
  const supabase = createClient()
  const [wishlist, setWishlist] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [query, setQuery] = useState('')

  const loadWishlist = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = '/login'; return }

    const { data } = await supabase
      .from('wishlist')
      .select('*')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })

    setWishlist(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadWishlist() }, [loadWishlist])

  const handleRemove = async (itemId: string) => {
    setRemoving(itemId)
    const res = await fetch('/api/wishlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId }),
    }).catch(() => null)
    if (res?.ok) setWishlist(prev => prev.filter(i => i.id !== itemId))
    setRemoving(null)
  }

  const types = useMemo(() => ['all', ...Array.from(new Set(wishlist.map(i => i.type).filter(Boolean)))], [wishlist])
  const availableCount = useMemo(() => wishlist.filter(i => i.release_date && new Date(i.release_date).getTime() <= Date.now()).length, [wishlist])
  const upcomingCount = useMemo(() => wishlist.filter(i => i.release_date && new Date(i.release_date).getTime() > Date.now()).length, [wishlist])

  const filtered = useMemo(() => {
    const q = normalize(query)
    let result = activeFilter === 'all' ? wishlist : wishlist.filter(i => i.type === activeFilter)
    if (q) {
      result = result.filter(item => normalize([item.title || '', item.type || '', item.description || ''].join(' ')).includes(q))
    }
    return result
  }, [wishlist, activeFilter, query])

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </main>
    )
  }

  return (
    <PageScaffold
      title="Wishlist"
      description="La tua coda dei desideri: titoli salvati da Discover e For You, pronti a diventare Library."
      icon={<Bookmark size={16} />}
      contentClassName="pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 grid grid-cols-3 gap-3">
        <WishlistStat label="salvati" value={wishlist.length} accent />
        <WishlistStat label="disponibili" value={availableCount} />
        <WishlistStat label="in arrivo" value={upcomingCount} />
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Cerca nella wishlist..."
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pl-10 pr-4 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
          />
        </div>

        {types.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {types.map(type => {
              const typeColor = type !== 'all' ? getMediaTypeColor(type) : 'var(--accent)'
              const count = type === 'all' ? wishlist.length : wishlist.filter(i => i.type === type).length
              const isActive = activeFilter === type
              return (
                <button
                  key={type}
                  onClick={() => setActiveFilter(type)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all"
                  style={isActive
                    ? { background: type === 'all' ? 'var(--accent)' : `color-mix(in srgb, ${typeColor} 18%, transparent)`, color: type === 'all' ? '#0B0B0F' : typeColor, borderColor: typeColor }
                    : { background: 'var(--bg-card)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: isActive && type === 'all' ? '#0B0B0F' : typeColor }} />
                  {type === 'all' ? 'Tutti' : getMediaTypeLabel(type)}
                  <span className="opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <Bookmark size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">
            {wishlist.length === 0 ? 'Wishlist vuota' : 'Nessun titolo trovato'}
          </p>
          <p className="gk-body mx-auto mb-5 max-w-sm">
            {wishlist.length === 0
              ? 'Vai su Discover e usa il segnalibro per salvare titoli che vuoi recuperare.'
              : 'Prova a cambiare ricerca o filtro.'}
          </p>
          {wishlist.length === 0 ? (
            <Link href="/discover" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
              Apri Discover
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => { setQuery(''); setActiveFilter('all') }}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Cancella filtri
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const Icon = TYPE_ICON[item.type] ?? Bookmark
            const countdown = daysUntil(item.release_date)
            const isRemoving = removing === item.id
            const color = getMediaTypeColor(item.type)

            return (
              <div
                key={item.id}
                className={`group flex items-center gap-3 overflow-hidden rounded-[20px] border bg-[var(--bg-card)] p-2.5 transition-all duration-200 hover:bg-[var(--bg-card-hover)] ${
                  countdown.available
                    ? 'border-emerald-500/35 shadow-[0_10px_32px_rgba(16,185,129,0.06)]'
                    : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
                }`}
              >
                <div className="h-[88px] w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
                  {item.cover_image ? (
                    <img src={item.cover_image} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon size={22} className="text-[var(--text-muted)]" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <MediaTypeBadge type={item.type} size="xs" />
                    {countdown.available && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        <CheckCircle2 size={10} /> ora
                      </span>
                    )}
                  </div>
                  <h3 className="line-clamp-1 text-[14px] font-bold leading-tight text-[var(--text-primary)]">{item.title}</h3>
                  {countdown.label ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {countdown.available ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Calendar size={11} className="text-[var(--text-muted)]" />}
                      <span className={`font-mono-data text-[11px] font-bold ${countdown.available ? 'text-emerald-400' : 'text-[var(--text-muted)]'}`}>
                        {countdown.label}
                      </span>
                    </div>
                  ) : (
                    <p className="gk-mono mt-1.5 text-[var(--text-muted)]">salvato per dopo</p>
                  )}
                </div>

                <button
                  onClick={() => handleRemove(item.id)}
                  disabled={isRemoving}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-[var(--text-muted)] transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                  title="Rimuovi dalla wishlist"
                >
                  {isRemoving
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />}
                </button>

                <div className="w-1 self-stretch rounded-full opacity-70" style={{ background: color }} />
              </div>
            )
          })}
        </div>
      )}
    </PageScaffold>
  )
}
