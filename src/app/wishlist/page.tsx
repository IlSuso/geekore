'use client'
// src/app/wishlist/page.tsx
// A4: Wishlist interattiva — rimuovi item, badge "Disponibile ora", filtro per tipo
// Convertito da Server Component puro a Server+Client ibrido

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { redirect } from 'next/navigation'
import {
  Bookmark, Calendar, Swords, Gamepad2, Film, Tv,
  Trash2, Check, Loader2, SlidersHorizontal, CheckCircle2, Layers,
} from 'lucide-react'
import { getMediaTypeColor, getMediaTypeLabel } from '@/lib/mediaTypes'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Swords, manga: Layers, game: Gamepad2, movie: Film, tv: Tv,
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

export default function WishlistPage() {
  const supabase = createClient()
  const [wishlist, setWishlist] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')

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
  }, [])

  useEffect(() => { loadWishlist() }, [loadWishlist])

  const handleRemove = async (itemId: string, title: string) => {
    setRemoving(itemId)
    const res = await fetch('/api/wishlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId }),
    }).catch(() => null)
    if (res?.ok) {
      setWishlist(prev => prev.filter(i => i.id !== itemId))
    } else {
    }
    setRemoving(null)
  }

  // Filtri per tipo
  const types = ['all', ...Array.from(new Set(wishlist.map(i => i.type)))]
  const filtered = activeFilter === 'all'
    ? wishlist
    : wishlist.filter(i => i.type === activeFilter)

  const availableCount = wishlist.filter(i => {
    if (!i.release_date) return false
    return new Date(i.release_date).getTime() <= Date.now()
  }).length

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] pt-2 md:pt-6 pb-24 px-4 text-white">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="hidden md:block text-3xl font-bold tracking-tight">Wishlist</h1>
              <p className="text-zinc-500 text-sm mt-1">
                {wishlist.length > 0
                  ? `${wishlist.length} ${wishlist.length === 1 ? 'titolo' : 'titoli'} nella lista`
                  : 'Uscite che stai aspettando'}
              </p>
            </div>
            {availableCount > 0 && (
              <div className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full">
                <p className="text-xs font-semibold text-emerald-400">
                  {availableCount} disponibil{availableCount === 1 ? 'e' : 'i'}
                </p>
              </div>
            )}
          </div>

          {/* Filtri per tipo */}
          {types.length > 2 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 hide-scrollbar">
              {types.map(type => {
                const typeColor = type !== 'all' ? getMediaTypeColor(type) : null
                return (
                  <button
                    key={type}
                    onClick={() => setActiveFilter(type)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      activeFilter === type
                        ? ''
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                    style={activeFilter === type ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
                  >
                    {typeColor && <span className="w-1.5 h-1.5 rounded-full" style={{ background: typeColor }} />}
                    {type === 'all' ? 'Tutti' : getMediaTypeLabel(type)}
                    <span className="opacity-60">
                      {type === 'all' ? wishlist.length : wishlist.filter(i => i.type === type).length}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mb-4">
              <Bookmark size={28} className="text-zinc-600" />
            </div>
            <p className="text-zinc-500 font-medium">
              {activeFilter === 'all' ? 'Wishlist vuota' : 'Nessun titolo in questa categoria'}
            </p>
            <p className="text-zinc-700 text-sm mt-1 max-w-xs">
              Vai su Discover e usa il pulsante segnalibro per aggiungere titoli che vuoi seguire
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const Icon = TYPE_ICON[item.type] ?? Bookmark
              const countdown = daysUntil(item.release_date)
              const isRemoving = removing === item.id

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-0 bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-200 ${
                    countdown.available
                      ? 'border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {/* Cover */}
                  <div className="w-16 h-24 shrink-0 bg-zinc-800">
                    {item.cover_image ? (
                      <img src={item.cover_image} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon size={24} className="text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <MediaTypeBadge type={item.type} size="xs" />
                    </div>
                    <h3 className="text-sm font-semibold text-white leading-tight truncate">{item.title}</h3>
                    {countdown.label && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {countdown.available ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Calendar size={11} className="text-zinc-600" />}
                        <span className={`text-xs font-medium ${
                          countdown.available ? 'text-emerald-400' : 'text-zinc-500'
                        }`}>
                          {countdown.label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* A4: Pulsante Rimuovi */}
                  <div className="pr-4 flex items-center">
                    <button
                      onClick={() => handleRemove(item.id, item.title)}
                      disabled={isRemoving}
                      className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                      title="Rimuovi dalla wishlist"
                    >
                      {isRemoving
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>

                  {/* Accent bar */}
                  <div className="w-1 self-stretch opacity-40" style={{ background: getMediaTypeColor(item.type) }} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
