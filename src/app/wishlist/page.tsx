'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Bookmark,
  Calendar,
  CheckCircle2,
  Film,
  Gamepad2,
  Layers,
  Loader2,
  Search,
  Swords,
  Trash2,
  Tv,
  X,
} from 'lucide-react'
import { getMediaTypeColor } from '@/lib/mediaTypes'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { PageScaffold } from '@/components/ui/PageScaffold'
import { useLocalizedMediaRows } from '@/lib/i18n/clientMediaLocalization'
import { useLocale } from '@/lib/locale'
import { pageCopy } from '@/lib/i18n/pageCopy'
import { typeLabel } from '@/lib/i18n/uiCopy'

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Swords,
  manga: Layers,
  game: Gamepad2,
  movie: Film,
  tv: Tv,
  boardgame: Layers,
  board_game: Layers,
}

function daysUntil(dateStr: string | null, locale: 'it' | 'en', copy: ReturnType<typeof pageCopy>['wishlist']): { label: string; available: boolean } {
  if (!dateStr) return { label: '', available: false }
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
  if (diff <= 0) return { label: copy.availableNow, available: true }
  if (diff === 1) return { label: copy.tomorrow, available: false }
  if (diff < 30) return { label: copy.inDays(diff), available: false }
  return {
    label: new Date(dateStr).toLocaleDateString(locale === 'en' ? 'en-US' : 'it-IT', { day: 'numeric', month: 'short', year: 'numeric' }),
    available: false,
  }
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function WishlistMetric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'accent' | 'green' }) {
  const toneClass = tone === 'accent' ? 'text-[var(--accent)]' : tone === 'green' ? 'text-emerald-300' : 'text-[var(--text-primary)]'
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-black/14 px-4 py-3">
      <p className={`font-mono-data text-[22px] font-black leading-none ${toneClass}`}>{value}</p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

function WishlistCard({ item, onRemove, isRemoving, locale, copy }: { item: any; onRemove: (id: string) => void; isRemoving: boolean; locale: 'it' | 'en'; copy: ReturnType<typeof pageCopy>['wishlist'] }) {
  const Icon = TYPE_ICON[item.type] ?? Bookmark
  const countdown = daysUntil(item.release_date, locale, copy)
  const color = getMediaTypeColor(item.type)

  return (
    <article
      className={`group relative grid grid-cols-[76px_1fr_auto] gap-3 overflow-hidden rounded-[24px] border bg-[var(--bg-card)] p-3 transition-all duration-200 hover:bg-[var(--bg-card-hover)] ${
        countdown.available
          ? 'border-emerald-500/30 shadow-[0_14px_44px_rgba(16,185,129,0.055)]'
          : 'border-[var(--border-subtle)] hover:border-[var(--border)]'
      }`}
    >
      <div className="h-[108px] w-[76px] overflow-hidden rounded-[18px] bg-[var(--bg-secondary)] ring-1 ring-white/5">
        {item.cover_image ? (
          <img
            src={item.cover_image}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon size={24} className="text-[var(--text-muted)]" />
          </div>
        )}
      </div>

      <div className="min-w-0 py-0.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <MediaTypeBadge type={item.type} size="xs" />
          {countdown.available && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-300">
              <CheckCircle2 size={10} /> {copy.now}
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 text-[15px] font-black leading-tight tracking-[-0.015em] text-[var(--text-primary)]">{item.title}</h3>
        {item.description ? (
          <p className="mt-1.5 text-[12.5px] leading-5 text-[var(--text-muted)]">{item.description}</p>
        ) : null}
        {countdown.label ? (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-black/16 px-2.5 py-1">
            {countdown.available ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Calendar size={12} className="text-[var(--text-muted)]" />}
            <span className={`font-mono-data text-[11px] font-black ${countdown.available ? 'text-emerald-300' : 'text-[var(--text-muted)]'}`}>
              {countdown.label}
            </span>
          </div>
        ) : (
          <p className="gk-mono mt-2 text-[var(--text-muted)]">{copy.savedForLater}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={isRemoving}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center self-start rounded-2xl border border-transparent text-[var(--text-muted)] transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
        title={copy.removeTitle}
        aria-label={copy.removeAria(item.title)}
      >
        {isRemoving ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
      </button>

      <div className="absolute inset-y-4 right-0 w-1 rounded-l-full opacity-60" style={{ background: color }} />
    </article>
  )
}

export default function WishlistPage() {
  const supabase = createClient()
  const { locale } = useLocale()
  const copy = pageCopy(locale).wishlist
  const [wishlist, setWishlist] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [query, setQuery] = useState('')
  const localizedWishlist = useLocalizedMediaRows(wishlist, {
    titleKeys: ['title'],
    coverKeys: ['cover_image'],
    idKeys: ['external_id'],
    typeKeys: ['type'],
    descriptionKeys: ['description'],
  })

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

  const types = useMemo(() => ['all', ...Array.from(new Set(localizedWishlist.map(i => i.type).filter(Boolean)))], [localizedWishlist])
  const availableCount = useMemo(() => localizedWishlist.filter(i => i.release_date && new Date(i.release_date).getTime() <= Date.now()).length, [localizedWishlist])
  const upcomingCount = useMemo(() => localizedWishlist.filter(i => i.release_date && new Date(i.release_date).getTime() > Date.now()).length, [localizedWishlist])

  const filtered = useMemo(() => {
    const q = normalize(query)
    let result = activeFilter === 'all' ? localizedWishlist : localizedWishlist.filter(i => i.type === activeFilter)
    if (q) result = result.filter(item => normalize([item.title || '', item.type || '', item.description || ''].join(' ')).includes(q))
    return result
  }, [localizedWishlist, activeFilter, query])

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </main>
    )
  }

  return (
    <PageScaffold
      title={copy.title}
      description={copy.description}
      icon={<Bookmark size={16} />}
      contentClassName="mx-auto max-w-screen-lg pt-2 md:pt-8 pb-28"
    >
      <section className="mb-5 rounded-[30px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/70 p-4 ring-1 ring-white/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 gk-section-eyebrow"><Bookmark size={12} /> {copy.eyebrow}</div>
            <h1 className="font-display text-[34px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)] md:text-[40px]">{copy.title}</h1>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:w-[440px]">
            <WishlistMetric label={copy.saved} value={wishlist.length} tone="accent" />
            <WishlistMetric label={copy.available} value={availableCount} tone="green" />
            <WishlistMetric label={copy.upcoming} value={upcomingCount} />
          </div>
        </div>
      </section>

      <section className="mb-5 rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/55 p-3 ring-1 ring-white/5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="w-full rounded-2xl border border-[var(--border)] bg-black/14 py-3 pl-10 pr-10 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.42)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-xl text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                aria-label={copy.clearSearchAria}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {types.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:max-w-[470px] lg:pb-0">
              {types.map(type => {
                const typeColor = type !== 'all' ? getMediaTypeColor(type) : 'var(--accent)'
                const count = type === 'all' ? localizedWishlist.length : localizedWishlist.filter(i => i.type === type).length
                const isActive = activeFilter === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveFilter(type)}
                    className="flex h-10 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-black transition-all"
                    style={isActive
                      ? { background: type === 'all' ? 'var(--accent)' : `color-mix(in srgb, ${typeColor} 18%, transparent)`, color: type === 'all' ? '#0B0B0F' : typeColor, borderColor: typeColor }
                      : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                  >
                    {type === 'all' ? copy.all : typeLabel(type, locale)}
                    <span className="opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <Bookmark size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">{localizedWishlist.length === 0 ? copy.emptyTitle : copy.noTitleFound}</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">
            {localizedWishlist.length === 0 ? copy.emptyDescription : copy.noResultsDescription}
          </p>
          {localizedWishlist.length === 0 ? (
            <Link href="/discover" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
              {pageCopy(locale).common.openDiscover}
            </Link>
          ) : (
            <button type="button" onClick={() => { setQuery(''); setActiveFilter('all') }} className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              {pageCopy(locale).common.clearFilters}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((item) => (
            <WishlistCard key={item.id} item={item} isRemoving={removing === item.id} onRemove={handleRemove} locale={locale} copy={copy} />
          ))}
        </div>
      )}
    </PageScaffold>
  )
}
