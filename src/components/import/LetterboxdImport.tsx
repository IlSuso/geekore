'use client'
// src/components/import/LetterboxdImport.tsx
// Componente per importare film e watchlist da Letterboxd via CSV.
// Letterboxd esporta uno .zip con più CSV; l'utente carica watched (films.csv) e/o watchlist.csv

import { useState, useRef } from 'react'
import { Download, CheckCircle, AlertTriangle, Loader2, ExternalLink, Upload, FileText, X } from 'lucide-react'

interface ImportResult {
  imported: number
  skipped: number
  total: number
  watched: number
  watchlist: number
  message: string
}

interface FileState {
  file: File | null
  error: string | null
}

export function LetterboxdImport() {
  const [watched, setWatched] = useState<FileState>({ file: null, error: null })
  const [watchlist, setWatchlist] = useState<FileState>({ file: null, error: null })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const watchedRef = useRef<HTMLInputElement>(null)
  const watchlistRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/csv') {
      return 'Seleziona un file .csv (export di Letterboxd)'
    }
    if (file.size > 10 * 1024 * 1024) {
      return 'File troppo grande (max 10MB)'
    }
    return null
  }

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<FileState>>
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateFile(file)
    setter({ file: err ? null : file, error: err })
    setResult(null)
    setGlobalError(null)
  }

  const handleDrop = (
    e: React.DragEvent,
    setter: React.Dispatch<React.SetStateAction<FileState>>
  ) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    const err = validateFile(file)
    setter({ file: err ? null : file, error: err })
    setResult(null)
    setGlobalError(null)
  }

  const handleImport = async () => {
    if (!watched.file && !watchlist.file) return
    setLoading(true)
    setResult(null)
    setGlobalError(null)

    try {
      const formData = new FormData()
      if (watched.file) formData.append('watched', watched.file)
      if (watchlist.file) formData.append('watchlist', watchlist.file)

      const res = await fetch('/api/import/letterboxd', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setGlobalError(data.error || "Errore durante l'importazione")
      } else {
        setResult(data)
      }
    } catch {
      setGlobalError('Errore di rete. Riprova tra qualche secondo.')
    }

    setLoading(false)
  }

  const FileDropZone = ({
    label,
    hint,
    state,
    setter,
    inputRef,
  }: {
    label: string
    hint: string
    state: FileState
    setter: React.Dispatch<React.SetStateAction<FileState>>
    inputRef: React.RefObject<HTMLInputElement>
  }) => (
    <div>
      <label className="block text-sm text-zinc-400 mb-2">{label}</label>
      <div
        onDrop={e => handleDrop(e, setter)}
        onDragOver={e => e.preventDefault()}
        onClick={() => !state.file && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-4 text-center transition-all ${
          state.file
            ? 'border-green-500/40 bg-green-500/5 cursor-default'
            : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/30 cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,application/csv"
          onChange={e => handleFileChange(e, setter)}
          className="hidden"
          disabled={loading}
        />

        {state.file ? (
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="text-green-400 flex-shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-sm font-medium text-white truncate">{state.file.name}</p>
                <p className="text-xs text-zinc-500">{(state.file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setter({ file: null, error: null }) }}
              className="text-zinc-500 hover:text-zinc-300 transition flex-shrink-0"
              disabled={loading}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div>
            <Upload size={18} className="mx-auto mb-1.5 text-zinc-500" />
            <p className="text-xs text-zinc-400">{hint}</p>
            <p className="text-xs text-zinc-600 mt-0.5">oppure clicca per selezionarlo</p>
          </div>
        )}
      </div>
      {state.error && (
        <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
          <AlertTriangle size={11} />
          {state.error}
        </p>
      )}
    </div>
  )

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center">
          <span className="text-base font-black text-emerald-400">LB</span>
        </div>
        <div>
          <h3 className="font-semibold text-white">Importa da Letterboxd</h3>
          <p className="text-xs text-zinc-500">Importa film visti e watchlist</p>
        </div>
        <a
          href="https://letterboxd.com/settings/data/"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-zinc-600 hover:text-zinc-400 transition"
          title="Esporta da Letterboxd"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Istruzioni */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 mb-5">
        <p className="text-xs font-semibold text-zinc-400 mb-2">Come esportare da Letterboxd:</p>
        <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
          <li>Vai su <a href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">letterboxd.com → Settings → Data</a></li>
          <li>Clicca <strong className="text-zinc-400">Export Your Data</strong> e scarica lo .zip</li>
          <li>Estrai lo .zip: troverai <code className="text-zinc-300">films.csv</code> e <code className="text-zinc-300">watchlist.csv</code></li>
          <li>Carica qui sotto uno o entrambi i file</li>
        </ol>
      </div>

      <div className="space-y-4">
        <FileDropZone
          label="🎬 Film visti (films.csv)"
          hint="Trascina films.csv qui"
          state={watched}
          setter={setWatched}
          inputRef={watchedRef}
        />

        <FileDropZone
          label="📋 Watchlist (watchlist.csv) — opzionale"
          hint="Trascina watchlist.csv qui"
          state={watchlist}
          setter={setWatchlist}
          inputRef={watchlistRef}
        />

        {globalError && (
          <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-sm text-red-400">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{globalError}</span>
          </div>
        )}

        {result && (
          <div className="flex items-start gap-3 p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl text-sm text-emerald-400">
            <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{result.message}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {result.watched > 0 && `${result.watched} film visti`}
                {result.watched > 0 && result.watchlist > 0 && ' • '}
                {result.watchlist > 0 && `${result.watchlist} in watchlist`}
                {result.skipped > 0 && ` • ${result.skipped} saltati`}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={(!watched.file && !watchlist.file) || loading}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-2xl font-semibold text-sm transition flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Importazione in corso...
            </>
          ) : (
            <>
              <Download size={16} />
              Importa da Letterboxd
            </>
          )}
        </button>

        {loading && (
          <p className="text-xs text-zinc-600 text-center">
            L'importazione può richiedere qualche secondo.
          </p>
        )}
      </div>
    </div>
  )
}
