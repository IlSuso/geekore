'use client'
// src/components/import/BooksImport.tsx
// Import manuale libri tramite ricerca Google Books.
// L'utente cerca un libro, lo seleziona e lo aggiunge alla collezione.
// Nessun CSV o account esterno necessario.

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  BookOpen, Search, X, Plus, Check, Loader2, AlertTriangle,
} from 'lucide-react'

interface BookResult {
  id: string
  title: string
  authors: string[]
  coverImage?: string
  year?: number
  genres: string[]
  pages?: number
  isbn?: string
  publisher?: string
  description?: string
  score?: number
}

interface Props {
  onImportDone?: () => void
}

export function BooksImport({ onImportDone }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookResult[]>([])
  const [loading, setLoading] = useState(false)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); setError(null); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/books?q=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Errore ricerca')
      const data: any[] = await res.json()
      setResults(data.map(item => ({
        id: item.id,
        title: item.title,
        authors: item.authors || [],
        coverImage: item.coverImage,
        year: item.year,
        genres: item.genres || [],
        pages: item.pages,
        isbn: item.isbn,
        publisher: item.publisher,
        description: item.description,
        score: item.score,
      })))
    } catch {
      setError('Errore durante la ricerca. Riprova.')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleQueryChange = (val: string) => {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 400)
  }

  const handleAdd = async (book: BookResult) => {
    if (addingId || addedIds.has(book.id)) return
    setAddingId(book.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showToast('Devi essere loggato'); return }

      const { error } = await supabase.from('user_media_entries').upsert({
        user_id: user.id,
        external_id: book.id,
        title: book.title,
        title_en: book.title,
        type: 'book',
        cover_image: book.coverImage || null,
        genres: book.genres,
        status: 'reading',
        rating: null,
        current_episode: 0,
        current_season: null,
        episodes: book.pages || null,
        season_episodes: null,
        studios: [],
        directors: [],
        authors: book.authors,
        developer: book.publisher || null,
        display_order: Date.now(),
      }, { onConflict: 'user_id,external_id' })

      if (error) throw error
      setAddedIds(prev => new Set([...prev, book.id]))
      showToast(`"${book.title}" aggiunto alla collezione`)
      onImportDone?.()

      // Aggiorna profilo gusti
      if (book.genres.length > 0) {
        fetch('/api/taste/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status_change', mediaId: book.id, mediaType: 'book', genres: book.genres, status: 'reading' }),
        }).catch(() => {})
      }
    } catch {
      showToast('Errore durante l\'aggiunta')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-cyan-500/15 rounded-2xl flex items-center justify-center flex-shrink-0">
          <BookOpen size={20} className="text-cyan-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Google Books</p>
          <p className="text-xs text-zinc-500">Cerca e aggiungi libri alla tua collezione</p>
        </div>
      </div>

      {/* Search input */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Titolo, autore, ISBN…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setError(null) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-cyan-400" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-800/50 text-red-400 text-xs rounded-xl mb-3">
          <AlertTriangle size={13} />{error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && results.length === 0 && query.trim().length >= 2 && (
        <p className="text-xs text-zinc-500 text-center py-6">Nessun risultato per "{query}"</p>
      )}

      {!loading && results.length === 0 && !query && (
        <p className="text-xs text-zinc-600 text-center py-4">Cerca un libro per iniziare</p>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {results.map(book => {
            const added = addedIds.has(book.id)
            const adding = addingId === book.id
            return (
              <div
                key={book.id}
                className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700/40 rounded-2xl hover:border-zinc-600/60 transition-colors"
              >
                {/* Cover */}
                <div className="w-10 h-14 flex-shrink-0 bg-zinc-700 rounded-lg overflow-hidden">
                  {book.coverImage
                    ? <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                    : <div className="w-full h-full flex items-center justify-center">
                        <BookOpen size={14} className="text-zinc-500" />
                      </div>}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white line-clamp-1">{book.title}</p>
                  {book.authors.length > 0 && (
                    <p className="text-xs text-zinc-400 line-clamp-1">{book.authors.slice(0, 2).join(', ')}</p>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    {book.year && <span className="text-[10px] text-zinc-600">{book.year}</span>}
                    {book.pages && <span className="text-[10px] text-zinc-600">{book.pages} pp.</span>}
                  </div>
                </div>

                {/* Add button */}
                <button
                  onClick={() => handleAdd(book)}
                  disabled={added || adding}
                  className={`w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center transition-all ${
                    added
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                      : adding
                        ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                >
                  {adding ? <Loader2 size={13} className="animate-spin" />
                    : added ? <Check size={13} />
                    : <Plus size={13} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
