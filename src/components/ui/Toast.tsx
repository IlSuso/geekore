// DESTINAZIONE: src/components/ui/Toast.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'
import { useLocale } from '@/lib/locale'

type ToastType = 'success' | 'error'

type ToastItem = {
  id: number
  message: string
  type: ToastType
}

let toastId = 0
let globalShowToast: ((message: string, type?: ToastType) => void) | null = null

export function showToast(message: string, type: ToastType = 'success') {
  globalShowToast?.(message, type)
}

export function ToastProvider() {
  const { locale } = useLocale()
  const closeLabel = locale === 'it' ? 'Chiudi notifica' : 'Close notification'
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    setToasts(prev => {
      if (prev.some(t => t.message === message && t.type === type)) return prev
      const id = ++toastId
      setTimeout(() => {
        setToasts(p => p.filter(t => t.id !== id))
      }, 3000)
      const base = prev.length >= 2 ? prev.slice(1) : prev
      return [...base, { id, message, type }]
    })
  }, [])

  useEffect(() => {
    globalShowToast = addToast
    return () => { globalShowToast = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => {
        const success = toast.type === 'success'
        return (
          <div
            key={toast.id}
            className="gk-toast flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-300"
            style={success ? { borderColor: 'rgba(230,255,61,0.24)' } : { borderColor: 'rgba(239,68,68,0.28)' }}
          >
            {success
              ? <CheckCircle size={18} className="shrink-0 text-[var(--accent)]" />
              : <XCircle size={18} className="shrink-0 text-red-400" />
            }
            <span className="text-[13px] font-bold text-[var(--text-primary)]">{toast.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="ml-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition shrink-0"
              aria-label={closeLabel}
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}