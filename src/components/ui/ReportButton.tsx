'use client'
// src/components/ui/ReportButton.tsx

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Flag, X, Check, Loader2 } from 'lucide-react'
import { androidBack } from '@/hooks/androidBack'
import { useLocale } from '@/lib/locale'

type TargetType = 'post' | 'comment' | 'profile' | 'profile_comment'
type Reason = 'spam' | 'harassment' | 'inappropriate' | 'misinformation' | 'other'

const REASONS: { value: Reason; label: { it: string; en: string } }[] = [
  { value: 'spam',           label: { it: 'Spam o pubblicità', en: 'Spam or advertising' } },
  { value: 'harassment',     label: { it: 'Molestie o insulti', en: 'Harassment or insults' } },
  { value: 'inappropriate',  label: { it: 'Contenuto inappropriato', en: 'Inappropriate content' } },
  { value: 'misinformation', label: { it: 'Informazioni false', en: 'False information' } },
  { value: 'other',          label: { it: 'Altro', en: 'Other' } },
]

interface ReportButtonProps {
  targetType: TargetType
  targetId: string
  iconOnly?: boolean
  className?: string
}

export function ReportButton({ targetType, targetId, iconOnly = false, className = '' }: ReportButtonProps) {
  const { locale } = useLocale()
  const copy = locale === 'en' ? { title: 'Report content', sent: 'Report sent', sentBody: 'We will review the content as soon as possible.', question: 'Why are you reporting this content?', detailsPlaceholder: 'Additional details (optional)...', submit: 'Submit report', buttonTitle: 'Report content', report: 'Report' } : { title: 'Segnala contenuto', sent: 'Segnalazione inviata', sentBody: 'Esamineremo il contenuto al più presto.', question: 'Perché stai segnalando questo contenuto?', detailsPlaceholder: 'Dettagli aggiuntivi (opzionale)...', submit: 'Invia segnalazione', buttonTitle: 'Segnala contenuto', report: 'Segnala' }
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const handleCloseRef = useRef<() => void>(null as any)
  const handleClose = () => {
    if (handleCloseRef.current) androidBack.pop(handleCloseRef.current)
    setOpen(false); setReason(null); setNotes('')
  }
  handleCloseRef.current = handleClose

  const handleSubmit = async () => {
    if (!reason) return
    setSubmitting(true)
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        reason,
        notes: notes.trim() || null,
      }),
    }).catch(() => null)
    if (res?.ok) {
      setDone(true)
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
          <h3 className="font-bold text-white">{copy.title}</h3>
          <button onClick={handleClose} className="text-zinc-500 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Check size={24} className="text-emerald-400" />
            </div>
            <p className="text-white font-medium">{copy.sent}</p>
            <p className="text-zinc-500 text-sm mt-1">{copy.sentBody}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-zinc-400 mb-4">{copy.question}</p>
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
                  {r.label[locale]}
                </button>
              ))}
            </div>
            {reason && (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 300))}
                placeholder={copy.detailsPlaceholder}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-600 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none transition mb-4"
              />
            )}
            <button
              onClick={handleSubmit}
              disabled={!reason || submitting}
              className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-2xl font-semibold text-sm transition flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Flag size={14} />}
              {copy.submit}
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
        onClick={() => { androidBack.push(handleClose); setOpen(true) }}
        title={copy.buttonTitle}
        className={`flex items-center gap-1.5 text-zinc-600 hover:text-red-400 transition-colors text-xs ${className}`}
      >
        <Flag size={12} />
        {!iconOnly && <span>{copy.report}</span>}
      </button>
      {modal}
    </>
  )
}
