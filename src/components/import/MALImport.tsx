'use client'
// src/components/import/MALImport.tsx
// Componente per importare la lista anime/manga da MyAnimeList via export XML.
// Integrare in /settings accanto ad AniListImport.

import { useState, useRef } from 'react'
import { useLocale } from '@/lib/locale'
import { Download, CheckCircle, AlertTriangle, Loader2, ExternalLink, Upload, FileText } from 'lucide-react'

interface ImportResult {
  imported: number
  merged: number
  skipped: number
  total: number
  anime: number
  manga: number
  message: string
}

type ProgressState = {
  step: string
  current: number
  total: number
  message: string
} | null


const MAL_COPY = {
  it: {
    selectXml: 'Seleziona un file .xml (export di MyAnimeList)',
    fileTooLarge: 'File troppo grande (max 5MB)',
    importError: "Errore durante l'importazione",
    networkError: 'Errore di rete. Riprova tra qualche secondo.',
    howToExport: 'Come esportare da MAL:',
    step1: 'Vai su',
    step1Link: 'myanimelist.net → Profilo → Export',
    step2: 'Clicca "Export My Anime List" o "Export My Manga List"',
    step3: 'Scarica il file',
    step3b: 'estrailo con un archivio',
    step4: 'Carica il file',
    step4b: 'qui sotto',
    dragXml: 'Trascina il file .xml qui',
    clickSelect: 'oppure clicca per selezionarlo',
    imported: 'importati',
    merged: 'uniti',
    skipped: 'saltati',
    importing: 'Importazione in corso...',
    importFrom: 'Importa da MyAnimeList',
  },
  en: {
    selectXml: 'Select a .xml file (MyAnimeList export)',
    fileTooLarge: 'File too large (max 5MB)',
    importError: 'Import failed',
    networkError: 'Network error. Try again in a few seconds.',
    howToExport: 'How to export from MAL:',
    step1: 'Go to',
    step1Link: 'myanimelist.net → Profile → Export',
    step2: 'Click "Export My Anime List" or "Export My Manga List"',
    step3: 'Download the',
    step3b: 'file and extract it with an archive tool',
    step4: 'Upload the',
    step4b: 'file below',
    dragXml: 'Drag the .xml file here',
    clickSelect: 'or click to select it',
    imported: 'imported',
    merged: 'merged',
    skipped: 'skipped',
    importing: 'Importing...',
    importFrom: 'Import from MyAnimeList',
  },
} as const

export function MALImport() {
  const { locale } = useLocale()
  const t = MAL_COPY[locale]
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<ProgressState>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (!selected.name.endsWith('.xml') && selected.type !== 'text/xml' && selected.type !== 'application/xml') {
      setError(t.selectXml)
      setFile(null)
      return
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError(t.fileTooLarge)
      setFile(null)
      return
    }

    setFile(selected)
    setError(null)
    setResult(null)
  }

  const handleImport = async () => {
    if (!file || loading) return
    setLoading(true)
    setResult(null)
    setError(null)
    setProgress(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/import/mal', { method: 'POST', body: formData })

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      const fakeEvent = { target: { files: [dropped] } } as unknown as React.ChangeEvent<HTMLInputElement>
      handleFileChange(fakeEvent)
    }
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      {/* Istruzioni */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 mb-5">
        <p className="text-xs font-semibold text-zinc-400 mb-2">{t.howToExport}</p>
        <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
          <li>{t.step1} <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{t.step1Link}</a></li>
          <li>{t.step2}</li>
          <li>{t.step3} <code className="text-zinc-300">.xml.gz</code>, {t.step3b}</li>
          <li>{t.step4} <code className="text-zinc-300">.xml</code> {t.step4b}</li>
        </ol>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
          file
            ? 'border-blue-500/50 bg-blue-500/5'
            : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={handleFileChange}
          className="hidden"
          disabled={loading}
        />

        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText size={20} className="text-blue-400 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-white truncate max-w-[200px]">{file.name}</p>
              <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
        ) : (
          <div>
            <Upload size={24} className="mx-auto mb-2 text-zinc-500" />
            <p className="text-sm text-zinc-400">{t.dragXml}</p>
            <p className="text-xs text-zinc-600 mt-1">{t.clickSelect}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-sm text-red-400 mt-4">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="flex items-start gap-3 p-4 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl text-sm text-emerald-400 mt-4">
          <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{result.message}</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {result.anime > 0 && `${result.anime} anime`}
              {result.anime > 0 && result.manga > 0 && ' • '}
              {result.manga > 0 && `${result.manga} manga`}
              {result.merged > 0 && ` • ${result.merged} ${t.merged}`}
              {result.skipped > 0 && ` • ${result.skipped} ${t.skipped}`}
            </p>
          </div>
        </div>
      )}

      {/* Barra di progresso */}
      {loading && progress && (
        <div className="space-y-1.5 mt-4">
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
        disabled={!file || loading}
        className="w-full mt-4 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-2xl font-semibold text-sm transition flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {t.importing}
          </>
        ) : (
          <>
            <Download size={16} />
            {t.importFrom}
          </>
        )}
      </button>
    </div>
  )
}