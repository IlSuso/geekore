'use client'
// src/app/lists/[id]/page.tsx
// Vista dettaglio di una lista personalizzata.
// Permette all'owner di aggiungere/rimuovere/riordinare i titoli.

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Globe, Lock, Trash2, ArrowLeft, Plus, Loader2,
  Film, BookOpen, Gamepad2, Tv, Dices, Share2,
} from 'lucide-react'
import Link from 'next/link'
import { showToast } from '@/components/ui/Toast'

// ─── Tipi ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film, manga: BookOpen, game: Gamepad2,
  tv: Tv, movie: Film, boardgame: Dices,
}

const TYPE_COLOR: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500', boardgame: 'bg-yellow-500',
}

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco',
  tv: 'Serie TV', movie: 'Film', boardgame: 'Board Game',
}

// ─── Componente ───────────────────────────────────────────────────────────────

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

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      // Carica lista
      const { data: listData, error: listError } = await supabase
        .from('user_lists')
        .select('id, title, description, is_public, user_id, created_at')
        .eq('id', id)
        .single()

      if (listError || !listData) { router.push('/lists'); return }

      // Carica profilo owner separatamente
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

      // Carica items
      const { data: itemsData, error: itemsError } = await supabase
        .from('user_list_items')
        .select('id, media_id, media_title, media_type, media_cover, notes, position')
        .eq('list_id', id)
        .order('position', { ascending: true })

      if (!itemsError) setItems(itemsData || [])

      // Se owner: carica collezione per poter aggiungere titoli
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
  }, [id])

  const handleRemoveItem = async (itemId: string) => {
    await supabase.from('user_list_items').delete().eq('id', itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
    showToast('Rimosso dalla lista')
  }

  const handleAddFromCollection = async (entry: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('user_list_items')
      .insert({
        list_id: id,
        user_id: user.id,
        media_id: entry.external_id,
        media_title: entry.title,
        media_type: entry.type,
        media_cover: entry.cover_image,
        position: items.length,
      })
      .select()
      .single()

    if (!error && data) {
      setItems(prev => [...prev, data])
      showToast(`"${entry.title}" aggiunto alla lista`)
    } else if (error?.code === '23505') {
      showToast('Già nella lista', 'error')
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}/lists/${id}`
    if (navigator.share) {
      await navigator.share({ title: list?.title, url })
    } else {
      await navigator.clipboard.writeText(url)
      showToast('Link copiato!')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-violet-400" />
      </div>
    )
  }

  if (!list) return null

  const filteredCollection = collectionItems.filter(
    c =>
      !items.some(i => i.media_id === c.external_id) &&
      (!searchFilter || c.title.toLowerCase().includes(searchFilter.toLowerCase()))
  )

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-2xl mx-auto px-3 sm:px-4 md:px-6 pt-8">

        {/* Back */}
        <Link
          href="/lists"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6 transition"
        >
          <ArrowLeft size={14} />
          Le mie liste
        </Link>

        {/* Header lista */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {list.is_public
                  ? <Globe size={14} className="text-emerald-400" />
                  : <Lock size={14} className="text-zinc-500" />}
                <span className="text-xs text-zinc-500">
                  {list.is_public ? 'Lista pubblica' : 'Lista privata'}
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">{list.title}</h1>
              {list.description && (
                <p className="text-zinc-400 mt-2 text-sm">{list.description}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-zinc-600">di</span>
                <Link
                  href={`/profile/${list.owner?.username}`}
                  className="text-xs text-violet-400 hover:text-violet-300 transition"
                >
                  @{list.owner?.username}
                </Link>
                <span className="text-xs text-zinc-600">•</span>
                <span className="text-xs text-zinc-600">{items.length} titoli</span>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {list.is_public && (
                <button
                  onClick={handleShare}
                  className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition"
                >
                  <Share2 size={16} />
                </button>
              )}
              {isOwner && (
                <button
                  onClick={() => setShowAddPanel(v => !v)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition"
                >
                  <Plus size={14} />
                  Aggiungi
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pannello aggiunta dalla collezione */}
        {showAddPanel && isOwner && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6">
            <p className="text-sm font-medium mb-3">Aggiungi dalla tua collezione</p>
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Cerca nella collezione..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgb(139,92,246)] focus:outline-none transition mb-3"
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredCollection.slice(0, 20).map(entry => {
                const Icon = TYPE_ICON[entry.type] || Film
                return (
                  <button
                    key={entry.external_id}
                    onClick={() => handleAddFromCollection(entry)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-800 transition text-left"
                  >
                    <div className="w-8 h-10 bg-zinc-700 rounded-lg overflow-hidden flex-shrink-0">
                      {entry.cover_image ? (
                        <img src={entry.cover_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon size={14} className="text-zinc-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{entry.title}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${TYPE_COLOR[entry.type] || 'bg-zinc-600'}`}>
                        {TYPE_LABEL[entry.type] || entry.type}
                      </span>
                    </div>
                    <Plus size={14} className="text-zinc-500 flex-shrink-0" />
                  </button>
                )
              })}
              {filteredCollection.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">
                  {searchFilter ? 'Nessun risultato' : 'Tutti i titoli della collezione sono già nella lista'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Lista items */}
        {items.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <Film size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Questa lista è vuota.</p>
            {isOwner && (
              <button
                onClick={() => setShowAddPanel(true)}
                className="mt-4 text-violet-400 hover:text-violet-300 text-sm transition"
              >
                Aggiungi titoli dalla tua collezione →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => {
              const Icon = TYPE_ICON[item.media_type] || Film
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl group hover:border-zinc-700 transition"
                >
                  {/* Numero */}
                  <div className="w-7 text-center flex-shrink-0">
                    <span className="text-sm font-bold text-zinc-600">#{idx + 1}</span>
                  </div>

                  {/* Cover */}
                  <div className="w-10 h-14 bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                    {item.media_cover ? (
                      <img src={item.media_cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon size={16} className="text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{item.media_title}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${TYPE_COLOR[item.media_type] || 'bg-zinc-600'}`}>
                      {TYPE_LABEL[item.media_type] || item.media_type}
                    </span>
                    {item.notes && (
                      <p className="text-xs text-zinc-500 mt-1 truncate">{item.notes}</p>
                    )}
                  </div>

                  {/* Delete (owner only) */}
                  {isOwner && (
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}