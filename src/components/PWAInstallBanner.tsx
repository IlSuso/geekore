'use client'
// src/components/PWAInstallBanner.tsx
// Banner di installazione PWA — intercetta beforeinstallprompt e mostra
// un banner nativo in-app invece di affidarsi al prompt automatico del browser
// (che su alcuni browser viene soppresso o non mostrato).

import { useEffect, useState } from 'react'
import { Download, X, Zap } from 'lucide-react'

const DISMISSED_KEY = 'pwa-install-dismissed-v1'

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Non mostrare se già installata come standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as any).standalone === true) return

    // Non mostrare se già dismissed di recente (7 giorni)
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed) {
      const daysAgo = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24)
      if (daysAgo < 7) return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Mostra dopo 3 secondi per non disturbare subito
      setTimeout(() => setShow(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setShow(false)
        setDeferredPrompt(null)
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem(DISMISSED_KEY, Date.now().toString())
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 left-3 right-3 md:left-auto md:right-6 md:bottom-6 md:w-80 z-[200] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 p-4 flex items-center gap-3">
        {/* Icona app */}
        <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/30">
          <Zap size={20} className="text-white" />
        </div>

        {/* Testo */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">Installa Geekore</p>
          <p className="text-xs text-zinc-400 mt-0.5">Accesso rapido dalla home</p>
        </div>

        {/* Bottoni */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-xl text-xs font-semibold text-white transition-all"
          >
            <Download size={13} />
            Installa
          </button>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
            aria-label="Chiudi"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
