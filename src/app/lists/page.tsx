'use client'
// src/app/lists/page.tsx
// Liste personalizzate: "Top 10 anime di sempre", "Da guardare con la ragazza", ecc.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { androidBack } from '@/hooks/androidBack'
import {
  List, Plus, Trash2, Edit3, Globe, Lock, X, Check,
  ChevronRight, Loader2, GripVertical,
} from 'lucide-react'
import Link from 'next/link'

// ─── Tipi ────────────────────────────────────────────────────────────────────

interface UserList {
  id: string
  title: string
  description?: string
  is_public: boolean
  cover_image?: string
  created_at: string
  item_count?: number
}

// ─── Modal crea/modifica lista ────────────────────────────────────────────────

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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">{list ? 'Modifica lista' : 'Nuova lista'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Titolo *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value.slice(0, 100))}
              placeholder="Es. Top 10 anime di sempre"
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-600 rounded-2xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none transition"
              maxLength={100}
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{title.length}/100</p>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Descrizione</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value.slice(0, 500))}
              placeholder="Breve descrizione della lista..."
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-600 rounded-2xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none resize-none transition"
              maxLength={500}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-zinc-800 rounded-2xl">
            <div className="flex items-center gap-2">
              {isPublic ? <Globe size={16} className="text-emerald-400" /> : <Lock size={16} className="text-zinc-400" />}
              <span className="text-sm font-medium">{isPublic ? 'Pubblica' : 'Privata'}</span>
              <span className="text-xs text-zinc-500">
                {isPublic ? 'Visibile a tutti' : 'Solo tu puoi vederla'}
              </span>
            </div>
            <button
              onClick={() => setIsPublic(v => !v)}
              className={`w-12 h-6 rounded-full transition-colors ${isPublic ? 'bg-emerald-500' : 'bg-zinc-600'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${isPublic ? 'translate-x-6' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-medium transition"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="flex-1 py-3 disabled:opacity-50 rounded-2xl font-semibold transition flex items-center justify-center gap-2"
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

// ─── Card lista ───────────────────────────────────────────────────────────────

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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-zinc-700 transition-colors group">
      <Link href={`/lists/${list.id}`} className="block p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {list.is_public
                ? <Globe size={12} className="text-emerald-400 flex-shrink-0" />
                : <Lock size={12} className="text-zinc-500 flex-shrink-0" />}
              <h3 className="font-semibold text-white truncate">{list.title}</h3>
            </div>
            {list.description && (
              <p className="text-xs text-zinc-500 line-clamp-2 mt-1">{list.description}</p>
            )}
            <p className="text-xs text-zinc-600 mt-2">
              {list.item_count ?? 0} {(list.item_count ?? 0) === 1 ? 'titolo' : 'titoli'}
            </p>
          </div>
          <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0 mt-1" />
        </div>
      </Link>

      <div className="px-5 pb-4 flex gap-2">
        <button
          onClick={() => onEdit(list)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <Edit3 size={12} /> Modifica
        </button>
        <button
          onClick={() => onDelete(list.id)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors ml-auto"
        >
          <Trash2 size={12} /> Elimina
        </button>
      </div>
    </div>
  )
}

// ─── Pagina principale ────────────────────────────────────────────────────────

export default function ListsPage() {
  const [lists, setLists] = useState<UserList[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingList, setEditingList] = useState<UserList | undefined>()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
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

      // Conta gli item per ogni lista
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
  }, [])

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
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-white px-3 sm:px-4 md:px-6 text-center">
        <div>
          <List size={48} className="mx-auto mb-4 text-zinc-600" />
          <h1 className="text-2xl font-bold mb-3">Le tue liste</h1>
          <p className="text-zinc-400 mb-6">Accedi per creare liste personalizzate</p>
          <Link href="/login" className="px-3 sm:px-4 md:px-6 py-3 rounded-2xl font-semibold transition" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
            Accedi
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white pb-24">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pt-8">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="hidden md:block text-4xl font-black tracking-tighter">Le mie liste</h1>
            <p className="text-zinc-400 text-sm mt-1">Crea collezioni tematiche da condividere</p>
          </div>
          <button
            onClick={() => { setEditingList(undefined); setShowModal(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm transition"
            style={{ background: 'var(--accent)', color: '#0B0B0F' }}
          >
            <Plus size={16} />
            Nuova lista
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : lists.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <List size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-400 font-medium mb-2">Nessuna lista ancora</p>
            <p className="text-zinc-600 text-sm mb-6">
              Crea la tua prima lista: "Top 10 anime di sempre", "Da guardare con gli amici"...
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 sm:px-4 md:px-6 py-3 rounded-2xl font-semibold transition"
            style={{ background: 'var(--accent)', color: '#0B0B0F' }}
            >
              Crea la prima lista
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {lists.map(list => (
              <ListCard
                key={list.id}
                list={list}
                onEdit={l => { setEditingList(l); setShowModal(true) }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ListModal
          list={editingList}
          onClose={() => { setShowModal(false); setEditingList(undefined) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
