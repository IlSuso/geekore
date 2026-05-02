'use client'
// src/app/lists/[id]/page.tsx
// Vista dettaglio di una lista personalizzata.
// Permette all'owner di aggiungere/rimuovere i titoli.

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Globe, Lock, Trash2, ArrowLeft, Plus, Loader2,
  Film, Gamepad2, Tv, Share2, Layers, Sparkles, Search, List,
} from 'lucide-react'
import Link from 'next/link'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { PageScaffold } from '@/components/ui/PageScaffold'

interface ListItem {
  id: string
  media_id: string
  media_title: string
  media_type: string
  media_cover?: string
  notes?: string
  position: number
}

interface ListData {
  id: string
  title: string
  description?: string
  is_public: boolean
  user_id: string
  created_at: string
  owner: {
    username: string
    display_name?: string
    avatar_url?: string
  }
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film,
  manga: Layers,
  game: Gamepad2,
  tv: Tv,
  movie: Film,
  boardgame: List,
}

function CollectionStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()

  const [list, setList] = useState<ListData | null>(null)
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [collectionItems, setCollectionItems] = useState<any[]>([])
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [searchFilter, setSearchFilter] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: listData, error: listError } = await supabase
        .from('user_lists')
        .select('id, title, description, is_public, user_id, created_at')
        .eq('id', id)
        .single()

      if (listError || !listData) { router.push('/lists'); return }

      const { data: ownerData } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', listData.user_id)
        .single()

      setList({
        ...listData,
        owner: ownerData || { username: '', display_name: undefined, avatar_url: undefined },
      })
      setIsOwner(user?.id === listData.user_id)

      const { data: itemsData, error: itemsError } = await supabase
        .from('user_list_items')
        .select('id, media_id, media_title, media_type, media_cover, notes, position')
        .eq('list_id', id)
        .order('position', { ascending: true })

      if (!itemsError) setItems(itemsData || [])

      if (user && user.id === listData.user_id) {
        const { data: col, error: colError } = await supabase
          .from('user_media_entries')
          .select('external_id, title, type, cover_image')
          .eq('user_id', user.id)
          .order('display_order', { ascending: false })
        if (!colError) setCollectionItems(col || [])
      }

      setLoading(false)
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemoveItem = async (itemId: string) => {
    setRemovingId(itemId)
    const res = await fetch('/api/lists/items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId }),
    }).catch(() => null)
    if (res?.ok) setItems(prev => prev.filter(i => i.id !== itemId))
    setRemovingId(null)
  }

  const handleAddFromCollection = async (entry: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setAddingId(entry.external_id)

    const res = await fetch('/api/lists/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        list_id: id,
        media_id: entry.external_id,
        media_title: entry.title,
        media_type: entry.type,
        media_cover: entry.cover_image,
        position: items.length,
      }),
    }).catch(() => null)

    if (res?.ok) {
      const data = await res.json()
      if (data.item) setItems(prev => [...prev, data.item])
    }
    setAddingId(null)
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/lists/${id}`
    if (navigator.share) await navigator.share({ title: list?.title, url }).catch(() => {})
    else await navigator.clipboard.writeText(url).catch(() => {})
  }

  const filteredCollection = useMemo(() => {
    const q = normalize(searchFilter)
    return collectionItems.filter(c =>
      !items.some(i => i.media_id === c.external_id) &&
      (!q || normalize(c.title || '').includes(q))
    )
  }, [collectionItems, items, searchFilter])

  const typeCount = useMemo(() => new Set(items.map(item => item.media_type)).size, [items])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </main>
    )
  }

  if (!list) return null

  return (
    <PageScaffold
      title={list.title}
      description={list.description || 'Lista curata della community Geekore.'}
      icon={<List size={16} />}
      contentClassName="max-w-3xl pt-2 md:pt-8 pb-28"
    >
      <Link
        href="/lists"
        data-no-swipe="true"
        className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft size={14} />
        Le mie liste
      </Link>

      <div className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
            <Sparkles size={12} />
            Curated list
          </div>
          <div className="flex items-center gap-2">
            {list.is_public && (
              <button
                type="button"
                data-no-swipe="true"
                onClick={handleShare}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/20 text-[var(--text-secondary)] transition-colors hover:text-white"
                aria-label="Condividi lista"
              >
                <Share2 size={16} />
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                data-no-swipe="true"
                onClick={() => setShowAddPanel(v => !v)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition-transform hover:scale-[1.02]"
                style={{ background: 'var(--accent)', color: '#0B0B0F' }}
              >
                <Plus size={15} />
                Aggiungi
              </button>
            )}
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2">
          {list.is_public ? <Globe size={14} className="text-emerald-400" /> : <Lock size={14} className="text-[var(--text-muted)]" />}
          <span className="gk-label">{list.is_public ? 'Lista pubblica' : 'Lista privata'}</span>
        </div>
        <h1 className="gk-h1 mb-2 text-[var(--text-primary)]">{list.title}</h1>
        {list.description && <p className="gk-body max-w-2xl">{list.description}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
          <span className="gk-caption">di</span>
          {list.owner?.username ? (
            <Link href={`/profile/${list.owner.username}`} data-no-swipe="true" className="gk-mono text-[var(--accent)] transition-opacity hover:opacity-80">
              @{list.owner.username}
            </Link>
          ) : (
            <span className="gk-mono text-[var(--text-muted)]">utente</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <CollectionStat label="titoli" value={items.length} accent />
          <CollectionStat label="medium" value={typeCount} />
          <CollectionStat label="visibilità" value={list.is_public ? 'pubblica' : 'privata'} />
        </div>
      </div>

      {showAddPanel && isOwner && (
        <div className="mb-6 overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--bg-card)]" data-no-swipe="true">
          <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.055),rgba(139,92,246,0.04),transparent)] px-4 py-3">
            <p className="gk-label text-[var(--accent)]">Aggiungi dalla tua collezione</p>
          </div>
          <div className="p-4">
            <div className="relative mb-3">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                data-no-swipe="true"
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Cerca nella collezione..."
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
              />
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto overscroll-contain pr-1">
              {filteredCollection.slice(0, 30).map(entry => {
                const Icon = TYPE_ICON[entry.type] || Film
                const isAdding = addingId === entry.external_id
                return (
                  <button
                    key={entry.external_id}
                    type="button"
                    data-no-swipe="true"
                    onClick={() => handleAddFromCollection(entry)}
                    disabled={isAdding}
                    className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors hover:bg-[var(--bg-card-hover)] disabled:opacity-60"
                  >
                    <div className="h-12 w-9 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
                      {entry.cover_image ? (
                        <img src={entry.cover_image} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Icon size={14} className="text-[var(--text-muted)]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--text-primary)]">{entry.title}</p>
                      <MediaTypeBadge type={entry.type} size="xs" />
                    </div>
                    {isAdding ? <Loader2 size={14} className="animate-spin text-[var(--accent)]" /> : <Plus size={14} className="flex-shrink-0 text-[var(--text-muted)]" />}
                  </button>
                )
              })}
              {filteredCollection.length === 0 && (
                <p className="gk-caption py-6 text-center">
                  {searchFilter ? 'Nessun risultato' : 'Tutti i titoli della collezione sono già nella lista'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <Film size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">Questa lista è vuota</p>
          <p className="gk-body mx-auto mb-5 max-w-sm">Aggiungi titoli dalla tua collezione per trasformarla in una raccolta curata.</p>
          {isOwner && (
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => setShowAddPanel(true)}
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]"
            >
              Aggiungi titoli
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => {
            const Icon = TYPE_ICON[item.media_type] || Film
            const isRemoving = removingId === item.id
            return (
              <div
                key={item.id}
                className="group flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-all hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]"
              >
                <div className="w-8 flex-shrink-0 text-center">
                  <span className="font-mono-data text-xs font-black text-[var(--text-muted)]">#{idx + 1}</span>
                </div>

                <div className="h-[64px] w-11 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
                  {item.media_cover ? (
                    <img src={item.media_cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Icon size={16} className="text-[var(--text-muted)]" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text-primary)]">{item.media_title}</p>
                  <MediaTypeBadge type={item.media_type} size="xs" />
                  {item.notes && <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{item.notes}</p>}
                </div>

                {isOwner && (
                  <button
                    type="button"
                    data-no-swipe="true"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={isRemoving}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-[var(--text-muted)] opacity-100 transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Rimuovi dalla lista"
                  >
                    {isRemoving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PageScaffold>
  )
}
