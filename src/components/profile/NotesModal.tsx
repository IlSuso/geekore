'use client'
// src/components/profile/NotesModal.tsx
// 7.4 — estratto da profile/[username]/page.tsx

import { X } from 'lucide-react'

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
}: NotesModalProps) {
  const charCount = value.length

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[120]">
      <div className="bg-zinc-900 rounded-3xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white truncate pr-4">{title}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white flex-shrink-0 transition-colors"
            aria-label="Chiudi"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-6">
          <div className="relative">
            <textarea
              value={value}
              onChange={e => onChange(e.target.value.slice(0, MAX_NOTES_LENGTH))}
              placeholder={placeholder}
              maxLength={MAX_NOTES_LENGTH}
              className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-2xl p-4 text-white resize-none overflow-y-auto focus:outline-none focus:border-violet-500 transition-colors"
            />
            <span className={`absolute bottom-3 right-3 text-[10px] font-medium transition-colors ${
              charCount > MAX_NOTES_LENGTH * 0.9
                ? charCount >= MAX_NOTES_LENGTH ? 'text-red-400' : 'text-yellow-400'
                : 'text-zinc-600'
            }`}>
              {charCount}/{MAX_NOTES_LENGTH}
            </span>
          </div>
        </div>
        <div className="p-6 border-t border-zinc-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition-colors font-medium"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl transition-colors font-medium"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
