'use client'
// src/components/ui/ReportButton.tsx

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'

type TargetType = 'post' | 'comment' | 'profile' | 'profile_comment'
type Reason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other'

const REASONS: { value: Reason; label: string }[] = [
  { value: 'spam',           label: 'Spam o pubblicità' },
  { value: 'harassment',     label: 'Molestie o insulti' },
  { value: 'inappropriate',  label: 'Contenuto inappropriato' },
  { value: 'misinformation', label: 'Informazioni false' },
  { value: 'other',          label: 'Altro' },
]

interface ReportButtonProps {
  targetType: TargetType
  targetId: string
  iconOnly?: boolean
  className?: string
}

export function ReportButton({ targetType, targetId, iconOnly = false, className = '' }: ReportButtonProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [mounted, setMounted] = useState(false)
  const supabase = createClient()

  useEffect(() => { setMounted(true) }, [])

  const handleClose = () => { setOpen(false); setReason(null); setNotes('') }

  const handleSubmit = async () => {
    if (!reason) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      showToast('Devi essere autenticato per segnalare', 'error')
      setSubmitting(false)
      return
    }
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      notes: notes.trim() || null,
    })
    if (error) {
      if (error.code === '23505') showToast('Hai già segnalato questo contenuto', 'error')
      else showToast('Errore nell\'invio della segnalazione', 'error')
    } else {
      setDone(true)
      showToast('Segnalazione inviata. Grazie!')
      setTimeout(() => { handleClose(); setDone(false) }, 1500)
    }
    setSubmitting(false)
  }

  const modal = open && mounted ? createPortal(
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white">Segnala contenuto</h3>
          <button onClick={handleClose} className="text-zinc-500 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Check size={24} className="text-emerald-400" />
            </div>
            <p className="text-white font-medium">Segnalazione inviata</p>
            <p className="text-zinc-500 text-sm mt-1">Esamineremo il contenuto al più presto.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-400 mb-4">Perché stai segnalando questo contenuto?</p>
            <div className="space-y-2 mb-4">
              {REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                    reason === r.value
                      ? 'bg-red-500/15 border-red-500/40 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {reason && (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 300))}
                placeholder="Dettagli aggiuntivi (opzionale)..."
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-transparent focus:shadow-[0_0_0_2px_rgb(139,92,246)] focus:outline-none rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none transition mb-4"
              />
            )}
            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-2xl font-semibold text-sm transition flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Flag size={14} />}
              Invia segnalazione
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Segnala contenuto"
        className={`flex items-center gap-1.5 text-zinc-600 hover:text-red-400 transition-colors text-xs ${className}`}
      >
        <Flag size={12} />
        {!iconOnly && <span>Segnala</span>}
      </button>
      {modal}
    </>
  )
}