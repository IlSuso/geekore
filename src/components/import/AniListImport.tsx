'use client'
// src/components/import/AniListImport.tsx
// Componente per importare la lista anime/manga da AniList.
// Integrare in /settings o /profile/edit

import { useState } from 'react'
import { useLocale } from '@/lib/locale'
import { Download, CheckCircle, AlertTriangle, Loader2, ExternalLink, Swords, BookOpen } from 'lucide-react'

interface ImportResult {
  imported: number
  merged: number
  skipped: number
  total: number
  errors?: string[]
  message: string
}

type ProgressState = {
  step: string
  current?: number
  total?: number
  page?: number
  message: string
} | null


const ANILIST_COPY = {
  it: {
    importError: "Errore durante l'importazione",
    networkError: 'Errore di rete. Riprova tra qualche secondo.',
    username: 'Username AniList',
    placeholder: 'il-tuo-username',
    publicHint: 'Il profilo AniList deve essere pubblico. Trovi lo username su',
    whatToImport: 'Cosa importare',
    imported: 'importati',
    merged: 'uniti',
    skipped: 'saltati',
    importing: 'Importazione in corso...',
    importList: 'Importa lista AniList',
  },
  en: {
    importError: 'Import failed',
    networkError: 'Network error. Try again in a few seconds.',
    username: 'AniList username',
    placeholder: 'your-username',
    publicHint: 'Your AniList profile must be public. You can find your username on',
    whatToImport: 'What to import',
    imported: 'imported',
    merged: 'merged',
    skipped: 'skipped',
    importing: 'Importing...',
    importList: 'Import AniList list',
  },
} as const

export function AniListImport() {
  const { locale } = useLocale()
  const t = ANILIST_COPY[locale]
  const [username, setUsername] = useState('')
  const [types, setTypes] = useState<string[]>(['ANIME', 'MANGA'])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<ProgressState>(null)
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
    setProgress(null)

    try {
      const res = await fetch('/api/import/anilist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anilist_username: username.trim(), types }),
      })

      if (!res.ok) {
        try { const data = await res.json(); setError(data.error || t.importError) }
        catch { setError(t.importError) }
        setLoading(false); return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === 'progress') setProgress(event)
            else if (event.type === 'done') { setResult(event); setProgress(null) }
            else if (event.type === 'error') { setError(event.message); setProgress(null) }
          } catch {}
        }
      }
    } catch {
      setError(t.networkError)
    }

    setLoading(false)
  }

  // Per AniList: fetch paginato (step='fetch', no total) → indeterminate
  //              salvataggio (step='save') → indeterminate
  const isDeterminate = progress && progress.step !== 'fetch' && (progress.total ?? 0) > 0
  const pct = isDeterminate
    ? Math.round(((progress!.current ?? 0) / (progress!.total ?? 1)) * 100)
    : null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-2">{t.username}</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={t.placeholder}
            className="w-full bg-zinc-800 border border-zinc-700 focus:border-blue-500 rounded-2xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none transition"
            disabled={loading}
          />
          <p className="text-xs text-zinc-600 mt-1">
            {t.publicHint}{' '}
            <a href="https://anilist.co" target="_blank" className="text-blue-400 hover:underline">anilist.co</a>
          </p>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">{t.whatToImport}</label>
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
                {type === 'ANIME'
                  ? <span className="flex items-center justify-center gap-1.5"><Swords size={14} /> Anime</span>
                  : <span className="flex items-center justify-center gap-1.5"><BookOpen size={14} /> Manga</span>
                }
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
                {result.imported > 0 && `${result.imported} ${t.imported}`}
                {result.merged > 0 && ` • ${result.merged} ${t.merged}`}
                {result.skipped > 0 && ` • ${result.skipped} ${t.skipped}`}
              </p>
            </div>
          </div>
        )}

        {/* Barra di progresso */}
        {loading && progress && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{progress.message}</span>
              {pct !== null && <span>{pct}%</span>}
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              {pct !== null ? (
                <div
                  className="h-full bg-blue-500 transition-all duration-300 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className="h-full bg-blue-500/60 rounded-full animate-pulse w-full" />
              )}
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
              {t.importing}
            </>
          ) : (
            <>
              <Download size={16} />
              {t.importList}
            </>
          )}
        </button>
      </div>
    </div>
  )
}