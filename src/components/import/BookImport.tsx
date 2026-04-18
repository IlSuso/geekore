'use client'
// src/components/import/BookImport.tsx
// Ricerca e aggiunta manuale di libri tramite Google Books

import { useState } from 'react'
import { BookOpen, Search, CheckCircle, AlertTriangle, Loader2, Plus, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface BookResult {
  id: string
  external_id: string
  title: string
  authors: string[]
  coverImage: string | null
  year: number | null
  genres: string[]
  score: number | null
  description: string | null
  pageCount: number | null
  publisher: string | null
  isbn: string | null
}

export function BookImport({ onImportDone }: { onImportDone?: () => void }) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<BookResult[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim() || loading) return
    setLoading(true)
    setError(null)
    setResults([])
    try {
      const res = await fetch(`/api/books?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error('Errore nella ricerca')
      const data = await res.json()
      setResults(data.results || [])
      if ((data.results || []).length === 0) setError('Nessun libro trovato. Prova con un altro titolo o autore.')
    } catch {
      setError('Errore di rete. Riprova.')
    }
    setLoading(false)
  }

  const handleAdd = async (book: BookResult) => {
    if (adding || added.has(book.id)) return
    setAdding(book.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Devi essere loggato.'); setAdding(null); return }

      const { error: err } = await supabase.from('user_media_entries').insert({
        user_id: user.id,
        external_id: book.external_id,
        type: 'book',
        title: book.title,
        cover_image: book.coverImage,
        genres: book.genres,
        score: null,
        status: 'planning',
        episodes: book.pageCount || null,   // pageCount → episodes (riuso campo)
        current_episode: 0,                 // pagine lette
        notes: null,
        year: book.year,
        authors: book.authors,
      })
      if (err) throw err
      setAdded(prev => new Set([...prev, book.id]))
      onImportDone?.()
    } catch (e: any) {
      setError(e.message || 'Errore durante il salvataggio.')
    }
    setAdding(null)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Titolo, autore o ISBN..."
          className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-2xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none transition text-sm"
          disabled={loading}
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          className="px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-2xl transition flex items-center gap-2 text-sm font-medium"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-sm text-red-400">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {results.map(book => (
            <div
              key={book.id}
              className="flex items-center gap-3 p-3 bg-zinc-800/60 rounded-2xl hover:bg-zinc-800 transition"
            >
              {/* Cover */}
              <div className="w-10 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-700">
                {book.coverImage ? (
                  <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen size={16} className="text-zinc-500" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{book.title}</p>
                {book.authors.length > 0 && (
                  <p className="text-xs text-zinc-400 truncate">{book.authors.slice(0, 2).join(', ')}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {book.year && <span className="text-xs text-zinc-500">{book.year}</span>}
                  {book.pageCount && <span className="text-xs text-zinc-500">{book.pageCount} pag.</span>}
                  {book.score != null && (
                    <span className="flex items-center gap-0.5 text-xs text-amber-400">
                      <Star size={10} fill="currentColor" />
                      {(book.score / 20).toFixed(1)}
                    </span>
                  )}
                  {book.genres.slice(0, 2).map(g => (
                    <span key={g} className="text-xs bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full">{g}</span>
                  ))}
                </div>
              </div>

              {/* Add button */}
              <button
                onClick={() => handleAdd(book)}
                disabled={!!adding || added.has(book.id)}
                className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition ${
                  added.has(book.id)
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 disabled:opacity-40'
                }`}
              >
                {adding === book.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : added.has(book.id) ? (
                  <CheckCircle size={14} />
                ) : (
                  <Plus size={14} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-600 text-center">
        Dati forniti da{' '}
        <a href="https://openlibrary.org" target="_blank" className="text-zinc-500 hover:text-zinc-400">
          Open Library
        </a>
      </p>
    </div>
  )
}
