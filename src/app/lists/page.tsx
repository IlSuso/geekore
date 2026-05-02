'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { androidBack } from '@/hooks/androidBack'
import {
  List, Plus, Trash2, Edit3, Globe, Lock, X, Check,
  ChevronRight, Loader2, Sparkles, Search,
} from 'lucide-react'
import { PageScaffold } from '@/components/ui/PageScaffold'

interface UserList {
  id: string
  title: string
  description?: string
  is_public: boolean
  cover_image?: string
  created_at: string
  item_count?: number
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function ListModal({
  list,
  onClose,
  onSaved,
}: {
  list?: UserList
  onClose: () => void
  onSaved: (list: UserList) => void
}) {
  const [title, setTitle] = useState(list?.title || '')
  const [description, setDescription] = useState(list?.description || '')
  const [isPublic, setIsPublic] = useState(list?.is_public ?? true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    androidBack.push(onClose)
    return () => androidBack.pop(onClose)
  }, [onClose])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)

    const res = await fetch('/api/lists', {
      method: list ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: list?.id,
        title,
        description,
        is_public: isPublic,
      }),
    }).catch(() => null)

    if (res?.ok) {
      const data = await res.json()
      if (data.list) onSaved(data.list)
    }

    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center" data-no-swipe="true">
      <div className="w-full max-w-md overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[var(--bg-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="border-b border-[var(--border)] bg-[rgba(230,255,61,0.04)] p-5">
          <div className="mb-2 flex items-center justify-between gap-4">
            <div>
              <div className="mb-2 gk-section-eyebrow">
                <Sparkles size={12} />
                Collection builder
              </div>
              <h3 className="gk-title text-[var(--text-primary)]">{list ? 'Modifica lista' : 'Nuova lista'}</h3>
            </div>
            <button type="button" data-no-swipe="true" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/20 text-[var(--text-secondary)] hover:text-white">
              <X size={17} />
            </button>
          </div>
          <p className="gk-caption">Crea raccolte tematiche da usare nel profilo e da condividere con la community.</p>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="gk-label mb-2 block">Titolo *</label>
            <input
              data-no-swipe="true"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, 100))}
              placeholder="Es. Top 10 anime di sempre"
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
              maxLength={100}
            />
            <p className="gk-mono mt-1 text-right text-[var(--text-muted)]">{title.length}/100</p>
          </div>

          <div>
            <label className="gk-label mb-2 block">Descrizione</label>
            <textarea
              data-no-swipe="true"
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 500))}
              placeholder="Breve descrizione della lista..."
              rows={3}
              className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
              maxLength={500}
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex min-w-0 items-center gap-2">
              {isPublic ? <Globe size={16} className="text-emerald-400" /> : <Lock size={16} className="text-[var(--text-muted)]" />}
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">{isPublic ? 'Pubblica' : 'Privata'}</p>
                <p className="gk-caption truncate">{isPublic ? 'Visibile a tutti' : 'Solo tu puoi vederla'}</p>
              </div>
            </div>
            <button
              type="button"
              data-no-swipe="true"
              onClick={() => setIsPublic(v => !v)}
              className="h-6 w-12 rounded-full p-0.5 transition-colors"
              style={{ background: isPublic ? 'var(--accent)' : 'var(--bg-card-hover)' }}
              aria-label="Cambia visibilità lista"
            >
              <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 border-t border-[var(--border)] p-5">
          <button
            type="button"
            data-no-swipe="true"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-[var(--border)] py-3 font-bold text-[var(--text-secondary)] transition hover:text-white"
          >
            Annulla
          </button>
          <button
            type="button"
            data-no-swipe="true"
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 font-black transition disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#0B0B0F' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {list ? 'Salva' : 'Crea'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ListCard({
  list,
  onEdit,
  onDelete,
}: {
  list: UserList
  onEdit: (list: UserList) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="group overflow-hidden rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
      <Link href={`/lists/${list.id}`} data-no-swipe="true" className="block p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[rgba(230,255,61,0.10)] text-[var(--accent)]">
            <List size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              {list.is_public
                ? <Globe size={12} className="flex-shrink-0 text-emerald-400" />
                : <Lock size={12} className="flex-shrink-0 text-[var(--text-muted)]" />}
              <h3 className="line-clamp-1 text-[15px] font-bold text-[var(--text-primary)]">{list.title}</h3>
            </div>
            {list.description ? (
              <p className="line-clamp-1 text-xs text-[var(--text-muted)]">{list.description}</p>
            ) : (
              <p className="gk-mono text-[var(--text-muted)]">raccolta personale</p>
            )}
            <p className="gk-mono mt-1 text-[var(--text-muted)]">
              {list.item_count ?? 0} {(list.item_count ?? 0) === 1 ? 'titolo' : 'titoli'} · {list.is_public ? 'pubblica' : 'privata'}
            </p>
          </div>
          <ChevronRight size={17} className="flex-shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]" />
        </div>
      </Link>

      <div className="flex gap-2 border-t border-[var(--border-subtle)] px-4 py-3" data-no-swipe="true">
        <button
          type="button"
          data-no-swipe="true"
          onClick={() => onEdit(list)}
          className="flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-bold text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
        >
          <Edit3 size={12} /> Modifica
        </button>
        <button
          type="button"
          data-no-swipe="true"
          onClick={() => onDelete(list.id)}
          className="ml-auto flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-bold text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 size={12} /> Elimina
        </button>
      </div>
    </div>
  )
}

function ListsStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
      <p className={`font-mono-data text-[20px] font-black leading-none ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</p>
      <p className="gk-label mt-1">{label}</p>
    </div>
  )
}

export default function ListsPage() {
  const [lists, setLists] = useState<UserList[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingList, setEditingList] = useState<UserList | undefined>()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [query, setQuery] = useState('')
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setIsLoggedIn(true)

      const { data } = await supabase
        .from('user_lists')
        .select('id, title, description, is_public, cover_image, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const listsWithCount = await Promise.all(
        (data || []).map(async l => {
          const { count } = await supabase
            .from('user_list_items')
            .select('id', { count: 'exact', head: true })
            .eq('list_id', l.id)
          return { ...l, item_count: count || 0 }
        })
      )

      setLists(listsWithCount)
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return lists
    return lists.filter(list => normalize([list.title, list.description || ''].join(' ')).includes(q))
  }, [lists, query])

  const publicCount = lists.filter(list => list.is_public).length
  const totalItems = lists.reduce((sum, list) => sum + (list.item_count || 0), 0)

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa lista?')) return
    const res = await fetch('/api/lists', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => null)
    if (res?.ok) setLists(prev => prev.filter(l => l.id !== id))
  }

  const handleSaved = (saved: UserList) => {
    setLists(prev => {
      const existing = prev.findIndex(l => l.id === saved.id)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { ...saved, item_count: prev[existing].item_count }
        return updated
      }
      return [{ ...saved, item_count: 0 }, ...prev]
    })
  }

  if (!isLoggedIn && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6 text-center text-white">
        <div>
          <List size={48} className="mx-auto mb-4 text-zinc-600" />
          <h1 className="mb-3 text-2xl font-bold">Le tue liste</h1>
          <p className="mb-6 text-zinc-400">Accedi per creare liste personalizzate</p>
          <Link href="/login" data-no-swipe="true" className="rounded-2xl px-6 py-3 font-semibold transition" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
            Accedi
          </Link>
        </div>
      </div>
    )
  }

  return (
    <PageScaffold
      title="Liste"
      description="Raccolte curate, classifiche personali e collezioni da condividere."
      icon={<List size={16} />}
      contentClassName="max-w-screen-md pt-2 md:pt-8 pb-28"
    >
      <div className="mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(160deg,rgba(230,255,61,0.07),var(--bg-secondary))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
        <div className="mb-2 gk-section-eyebrow">
          <Sparkles size={12} />
          Curated collections
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="gk-h1 mb-2 text-[var(--text-primary)]">Liste che raccontano il tuo universo.</h1>
            <p className="gk-body max-w-2xl">Top, percorsi, watch party, backlog e classifiche personali: non solo archiviazione, ma identità curata.</p>
          </div>
          <button
            type="button"
            data-no-swipe="true"
            onClick={() => { setEditingList(undefined); setShowModal(true) }}
            className="inline-flex h-10 flex-shrink-0 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition-transform hover:scale-[1.02]"
            style={{ background: 'var(--accent)', color: '#0B0B0F' }}
          >
            <Plus size={16} />
            Nuova lista
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4">
          <ListsStat label="liste" value={lists.length} accent />
          <ListsStat label="pubbliche" value={publicCount} />
          <ListsStat label="titoli" value={totalItems} />
        </div>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          data-no-swipe="true"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Cerca liste, temi, descrizioni..."
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-2.5 pl-10 pr-4 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-[98px] rounded-2xl bg-[var(--bg-card)] skeleton" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <List size={28} className="text-[var(--text-muted)]" />
          </div>
          <p className="gk-headline mb-1 text-[var(--text-primary)]">
            {lists.length === 0 ? 'Nessuna lista ancora' : 'Nessuna lista trovata'}
          </p>
          <p className="gk-body mx-auto mb-5 max-w-sm">
            {lists.length === 0
              ? 'Crea la tua prima lista: Top 10 anime, backlog estivo, film da vedere con amici.'
              : 'Prova a cambiare ricerca.'}
          </p>
          <button
            type="button"
            data-no-swipe="true"
            onClick={() => { lists.length === 0 ? setShowModal(true) : setQuery('') }}
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]"
          >
            {lists.length === 0 ? 'Crea la prima lista' : 'Cancella ricerca'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(list => (
            <ListCard
              key={list.id}
              list={list}
              onEdit={l => { setEditingList(l); setShowModal(true) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showModal && (
        <ListModal
          list={editingList}
          onClose={() => { setShowModal(false); setEditingList(undefined) }}
          onSaved={handleSaved}
        />
      )}
    </PageScaffold>
  )
}
