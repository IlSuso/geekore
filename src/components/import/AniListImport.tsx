'use client'
// src/components/import/AniListImport.tsx
// Componente per importare la lista anime/manga da AniList.
// Integrare in /settings o /profile/edit

import { useState } from 'react'
import { Download, CheckCircle, AlertTriangle, Loader2, ExternalLink } from 'lucide-react'

interface ImportResult {
  imported: number
  skipped: number
  total: number
  message: string
}

export function AniListImport() {
  const [username, setUsername] = useState('')
  const [types, setTypes] = useState<string[]>(['ANIME', 'MANGA'])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleType = (type: string) => {
    setTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const handleImport = async () => {
    if (!username.trim() || !types.length) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/import/anilist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anilist_username: username.trim(), types }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Errore durante l\'importazione')
      } else {
        setResult(data)
      }
    } catch {
      setError('Errore di rete. Riprova tra qualche secondo.')
    }

    setLoading(false)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center">
          <Download size={18} className="text-blue-400" />
        </div>
        <div>
          <h3 className="font-semibold text-white">Importa da AniList</h3>
          <p className="text-xs text-zinc-500">Importa la tua lista anime e manga</p>
        </div>
        <a
          href="https://anilist.co"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-zinc-600 hover:text-zinc-400 transition"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">Username AniList</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="il-tuo-username"
            className="w-full bg-zinc-800 border border-zinc-700 focus:border-blue-500 rounded-2xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none transition"
            disabled={loading}
          />
          <p className="text-xs text-zinc-600 mt-1">
            Il profilo AniList deve essere pubblico. Trovi lo username su{' '}
            <a href="https://anilist.co" target="_blank" className="text-blue-400 hover:underline">anilist.co</a>
          </p>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">Cosa importare</label>
          <div className="flex gap-2">
            {['ANIME', 'MANGA'].map(type => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  types.includes(type)
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                }`}
                disabled={loading}
              >
                {type === 'ANIME' ? '🎌 Anime' : '📖 Manga'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-sm text-red-400">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-3 p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl text-sm text-emerald-400">
            <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{result.message}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {result.imported} importati • {result.skipped} saltati
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!username.trim() || !types.length || loading}
          className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-2xl font-semibold text-sm transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Importazione in corso...
            </>
          ) : (
            <>
              <Download size={16} />
              Importa lista AniList
            </>
          )}
        </button>

        {loading && (
          <p className="text-xs text-zinc-600 text-center">
            L'importazione può richiedere qualche minuto per liste molto grandi.
          </p>
        )}
      </div>
    </div>
  )
}