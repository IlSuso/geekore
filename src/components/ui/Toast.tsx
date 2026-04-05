// DESTINAZIONE: src/components/ui/Toast.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

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
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    globalShowToast = addToast
    return () => { globalShowToast = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border pointer-events-auto
            animate-in slide-in-from-right-4 fade-in duration-300
            ${toast.type === 'success'
              ? 'bg-zinc-900 border-emerald-800 text-emerald-400'
              : 'bg-zinc-900 border-red-800 text-red-400'
            }`}
        >
          {toast.type === 'success'
            ? <CheckCircle size={18} className="shrink-0" />
            : <XCircle size={18} className="shrink-0" />
          }
          <span className="text-sm font-medium text-white">{toast.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="ml-1 text-zinc-500 hover:text-white transition shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}