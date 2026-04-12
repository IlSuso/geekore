'use client'
// src/components/import/LetterboxdImport.tsx

import { useState, useRef } from 'react'
import { Download, CheckCircle, AlertTriangle, Loader2, ExternalLink, Upload, FileText, X, ChevronDown, ChevronUp } from 'lucide-react'

interface ImportResult {
  imported: number
  skipped: number
  total: number
  watched: number
  ratings: number
  watchlist: number
  list: number
  message: string
}

interface FileState { file: File | null; error: string | null }
const emptyFile = (): FileState => ({ file: null, error: null })

// ── FileDropZone ──────────────────────────────────────────────────────────────

function FileDropZone({
  label, sublabel, hint, state, setter, inputRef, disabled,
}: {
  label: string; sublabel?: string; hint: string
  state: FileState; setter: (s: FileState) => void
  inputRef: React.RefObject<HTMLInputElement>; disabled: boolean
}) {
  const validate = (file: File): string | null => {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && file.type !== 'text/plain')
      return 'Seleziona un file .csv'
    if (file.size > 10 * 1024 * 1024) return 'File troppo grande (max 10MB)'
    return null
  }

  const handle = (file: File) => {
    const err = validate(file)
    setter({ file: err ? null : file, error: err })
  }

  return (
    <div>
      <div className="mb-1.5">
        <span className="text-sm text-zinc-300 font-medium">{label}</span>
        {sublabel && <span className="ml-2 text-xs text-zinc-500">{sublabel}</span>}
      </div>
      <div
        onDrop={e => { e.preventDefault(); if (!state.file) handle(e.dataTransfer.files[0]) }}
        onDragOver={e => e.preventDefault()}
        onClick={() => !state.file && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-3.5 text-center transition-all ${
          state.file
            ? 'border-emerald-500/40 bg-emerald-500/5 cursor-default'
            : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/30 cursor-pointer'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={e => { const f = e.target.files?.[0]; if (f) handle(f) }}
          className="hidden"
          disabled={disabled}
        />
        {state.file ? (
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={15} className="text-emerald-400 flex-shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-sm font-medium text-white truncate">{state.file.name}</p>
                <p className="text-xs text-zinc-500">{(state.file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setter(emptyFile()) }}
              className="text-zinc-500 hover:text-zinc-300 transition flex-shrink-0"
              disabled={disabled}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-zinc-500">
            <Upload size={15} />
            <span className="text-xs">{hint}</span>
          </div>
        )}
      </div>
      {state.error && (
        <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
          <AlertTriangle size={11} />{state.error}
        </p>
      )}
    </div>
  )
}

// ── Componente principale ─────────────────────────────────────────────────────

export function LetterboxdImport() {
  const [watched,   setWatched]   = useState<FileState>(emptyFile())
  const [ratings,   setRatings]   = useState<FileState>(emptyFile())
  const [watchlist, setWatchlist] = useState<FileState>(emptyFile())
  const [listFile,  setListFile]  = useState<FileState>(emptyFile())
  const [listName,  setListName]  = useState('')
  const [showList,  setShowList]  = useState(false)

  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState<ImportResult | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const watchedRef   = useRef<HTMLInputElement>(null)
  const ratingsRef   = useRef<HTMLInputElement>(null)
  const watchlistRef = useRef<HTMLInputElement>(null)
  const listRef      = useRef<HTMLInputElement>(null)

  const hasAnyFile = watched.file || ratings.file || watchlist.file || listFile.file

  const handleImport = async () => {
    if (!hasAnyFile || loading) return
    setLoading(true); setResult(null); setGlobalError(null)
    try {
      const formData = new FormData()
      if (watched.file)   formData.append('watched', watched.file)
      if (ratings.file)   formData.append('ratings', ratings.file)
      if (watchlist.file) formData.append('watchlist', watchlist.file)
      if (listFile.file)  formData.append('list', listFile.file)
      if (listName.trim()) formData.append('list_name', listName.trim())

      const res = await fetch('/api/import/letterboxd', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) setGlobalError(data.error || "Errore durante l'importazione")
      else setResult(data)
    } catch {
      setGlobalError('Errore di rete. Riprova tra qualche secondo.')
    }
    setLoading(false)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center">
          <span className="text-base font-black text-emerald-400">LB</span>
        </div>
        <div>
          <h3 className="font-semibold text-white">Importa da Letterboxd</h3>
          <p className="text-xs text-zinc-500">Film visti, voti, watchlist e liste</p>
        </div>
        <a
          href="https://letterboxd.com/settings/data/"
          target="_blank" rel="noopener noreferrer"
          className="ml-auto text-zinc-600 hover:text-zinc-400 transition"
          title="Vai alle impostazioni Letterboxd"
        >
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Come esportare */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 mb-5 text-xs text-zinc-500 space-y-2">
        <p className="font-semibold text-zinc-400">Come ottenere i file:</p>
        <p>
          Vai su{' '}
          <a href="https://letterboxd.com/settings/data/" target="_blank" rel="noopener noreferrer"
            className="text-emerald-400 hover:underline">
            letterboxd.com → Settings → Data
          </a>
          {' '}→ <strong className="text-zinc-300">Export Your Data</strong>.
          Scarica e decomprimi lo .zip: troverai i file elencati sotto.
        </p>
      </div>

      {/* Sezione principale: watched + ratings */}
      <div className="space-y-3 mb-4">

        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-base">🎬</span>
            <div>
              <p className="text-sm font-semibold text-white">Film visti + voti</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                <strong className="text-zinc-400">Consigliato:</strong> carica entrambi —
                <code className="text-zinc-300 mx-1">watched.csv</code> contiene tutti i film visti,
                <code className="text-zinc-300 mx-1">ratings.csv</code> aggiunge i voti a quelli che hai votato.
                Puoi caricare anche solo uno dei due.
              </p>
            </div>
          </div>

          <FileDropZone
            label="watched.csv"
            sublabel="— tutti i film visti"
            hint="Trascina watched.csv qui"
            state={watched} setter={setWatched} inputRef={watchedRef} disabled={loading}
          />
          <FileDropZone
            label="ratings.csv"
            sublabel="— film votati (aggiunge i voti)"
            hint="Trascina ratings.csv qui"
            state={ratings} setter={setRatings} inputRef={ratingsRef} disabled={loading}
          />
        </div>

        {/* Watchlist */}
        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-base">📋</span>
            <div>
              <p className="text-sm font-semibold text-white">Watchlist <span className="text-zinc-500 font-normal text-xs">— opzionale</span></p>
              <p className="text-xs text-zinc-500 mt-0.5">
                <code className="text-zinc-300">watchlist.csv</code> — film che vuoi vedere, salvati come "da vedere".
              </p>
            </div>
          </div>
          <FileDropZone
            label="watchlist.csv"
            hint="Trascina watchlist.csv qui"
            state={watchlist} setter={setWatchlist} inputRef={watchlistRef} disabled={loading}
          />
        </div>

        {/* Lista personalizzata — collassabile */}
        <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowList(v => !v)}
            className="w-full flex items-center gap-2 p-4 text-left hover:bg-zinc-700/20 transition"
          >
            <span className="text-base">📁</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">
                Lista personalizzata <span className="text-zinc-500 font-normal text-xs">— opzionale</span>
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Esporta una tua lista dal profilo e caricala qui. I film entrano nel tuo profilo con il nome della lista come tag.
              </p>
            </div>
            {showList ? <ChevronUp size={15} className="text-zinc-500" /> : <ChevronDown size={15} className="text-zinc-500" />}
          </button>

          {showList && (
            <div className="px-4 pb-4 space-y-3 border-t border-zinc-700/50 pt-3">
              <p className="text-xs text-zinc-500">
                Per esportare una lista: vai sulla lista nel tuo profilo Letterboxd → icona ••• → <strong className="text-zinc-400">Export list as CSV</strong>.
              </p>
              <div>
                <label className="block text-sm text-zinc-300 font-medium mb-1.5">
                  Nome lista <span className="text-zinc-500 font-normal text-xs">(usato come tag sui film)</span>
                </label>
                <input
                  type="text"
                  value={listName}
                  onChange={e => setListName(e.target.value.slice(0, 50))}
                  placeholder="es. Film che riguarderei volentieri"
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
                  disabled={loading}
                />
              </div>
              <FileDropZone
                label="Lista .csv"
                hint="Trascina il file della lista qui"
                state={listFile} setter={setListFile} inputRef={listRef} disabled={loading}
              />
            </div>
          )}
        </div>
      </div>

      {/* Errore / Risultato */}
      {globalError && (
        <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-sm text-red-400 mb-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{globalError}</span>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl text-sm text-emerald-400 mb-4">
          <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{result.message}</p>
            <p className="text-xs text-emerald-600 mt-1 space-x-2">
              {result.watched > 0 && <span>{result.watched} visti</span>}
              {result.ratings > 0 && <span>• {result.ratings} voti</span>}
              {result.watchlist > 0 && <span>• {result.watchlist} watchlist</span>}
              {result.list > 0 && <span>• {result.list} da lista</span>}
              {result.skipped > 0 && <span>• {result.skipped} saltati</span>}
            </p>
          </div>
        </div>
      )}

      {/* Bottone */}
      <button
        onClick={handleImport}
        disabled={!hasAnyFile || loading}
        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-2xl font-semibold text-sm transition flex items-center justify-center gap-2"
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" />Importazione in corso...</>
          : <><Download size={16} />Importa da Letterboxd</>
        }
      </button>

      {loading && (
        <p className="text-xs text-zinc-600 text-center mt-2">
          L'importazione può richiedere qualche secondo.
        </p>
      )}
    </div>
  )
}
