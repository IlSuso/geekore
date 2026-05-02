'use client'
// src/components/profile/NotesModal.tsx
// Notes modal coerente con il redesign Profile / Library.

import { useEffect } from 'react'
import { X, Edit3, Sparkles } from 'lucide-react'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'

const MAX_NOTES_LENGTH = 1000

interface NotesModalProps {
  title: string
  value: string
  onChange: (val: string) => void
  onSave: () => void
  onClose: () => void
  saveLabel?: string
  cancelLabel?: string
  placeholder?: string
  readOnly?: boolean
}

export function NotesModal({
  title,
  value,
  onChange,
  onSave,
  onClose,
  saveLabel = 'Salva',
  cancelLabel = 'Annulla',
  placeholder = 'Scrivi le tue note...',
  readOnly = false,
}: NotesModalProps) {
  useEffect(() => {
    gestureState.drawerActive = true
    androidBack.push(onClose)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      gestureState.drawerActive = false
      androidBack.pop(onClose)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const charCount = value.length
  const nearLimit = charCount > MAX_NOTES_LENGTH * 0.9

  return (
    <div
      data-no-swipe="true"
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[var(--bg-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.08),rgba(139,92,246,0.06),rgba(20,20,27,0.92))] p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                {readOnly ? <Sparkles size={12} /> : <Edit3 size={12} />}
                {readOnly ? 'Private notes' : 'Notes editor'}
              </div>
              <h3 className="line-clamp-2 text-[18px] font-black leading-tight text-[var(--text-primary)]">{title}</h3>
              <p className="gk-caption mt-1">{readOnly ? 'Note salvate su questo media.' : 'Aggiungi contesto personale alla tua libreria.'}</p>
            </div>
            <button
              type="button"
              data-no-swipe="true"
              onClick={onClose}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/20 text-[var(--text-secondary)] transition-colors hover:text-white"
              aria-label="Chiudi"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="p-5">
          {readOnly ? (
            <div className="max-h-72 min-h-[8rem] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              {value || 'Nessuna nota salvata.'}
            </div>
          ) : (
            <div className="relative">
              <textarea
                data-no-swipe="true"
                value={value}
                onChange={event => onChange(event.target.value.slice(0, MAX_NOTES_LENGTH))}
                placeholder={placeholder}
                maxLength={MAX_NOTES_LENGTH}
                className="h-44 w-full resize-none overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 pb-8 text-sm leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
              />
              <span
                className={`absolute bottom-3 right-3 font-mono-data text-[10px] font-bold transition-colors ${
                  nearLimit ? (charCount >= MAX_NOTES_LENGTH ? 'text-red-400' : 'text-yellow-400') : 'text-[var(--text-muted)]'
                }`}
              >
                {charCount}/{MAX_NOTES_LENGTH}
              </span>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex gap-3 border-t border-[var(--border)] p-5">
            <button
              type="button"
              data-no-swipe="true"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-[var(--border)] py-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-white"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              data-no-swipe="true"
              onClick={onSave}
              className="flex-1 rounded-2xl py-3 text-sm font-black transition-transform hover:scale-[1.01]"
              style={{ background: 'var(--accent)', color: '#0B0B0F' }}
            >
              {saveLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
