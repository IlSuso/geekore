'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Download, X, Zap } from 'lucide-react'
import { useLocale } from '@/lib/locale'

const SKIP_PATHS = ['/login', '/register', '/forgot-password', '/onboarding', '/auth']

const DISMISSED_KEY = 'pwa-install-dismissed-v1'
const VISIT_COUNT_KEY = 'geekore-visit-count'
const PWA_HANDLED_KEY = 'pwa-handled' // installata o dismissata

export function PWAInstallBanner() {
  const pathname = usePathname()
  const { locale } = useLocale()
  const copy = locale === 'en' ? { title: 'Install Geekore', subtitle: 'Quick access from your home screen', install: 'Install', close: 'Close' } : { title: 'Installa Geekore', subtitle: 'Accesso rapido dalla home', install: 'Installa', close: 'Chiudi' }
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [show, setShow] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (SKIP_PATHS.some(p => pathname.startsWith(p))) return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if ((window.navigator as any).standalone === true) return

    // Incrementa contatore visite
    const visits = parseInt(localStorage.getItem(VISIT_COUNT_KEY) || '0') + 1
    localStorage.setItem(VISIT_COUNT_KEY, String(visits))

    // Non mostrare se già dismissed di recente (30 giorni)
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed) {
      const daysAgo = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24)
      if (daysAgo < 30) return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)

      // Prima visita: aspetta 5s. Dalla seconda: aspetta 3s
      const delay = visits === 1 ? 5_000 : 3_000
      setTimeout(() => { setShow(true); localStorage.setItem('pwa-showing', '1') }, delay)
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
        localStorage.setItem(PWA_HANDLED_KEY, '1')
        localStorage.removeItem('pwa-showing')
        setShow(false)
        setDeferredPrompt(null)
      }
    } finally {
      setInstalling(false)
    }
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.removeItem('pwa-showing')
    localStorage.setItem(DISMISSED_KEY, Date.now().toString())
    localStorage.setItem(PWA_HANDLED_KEY, '1')
  }

  if (!show) return null

  return (
    <div className="fixed bottom-20 left-3 right-3 md:left-auto md:right-6 md:bottom-6 md:w-80 z-[200] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
          <Zap size={20} className="text-black" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">{copy.title}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleInstall} disabled={installing}
            className="flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-60 rounded-xl text-xs font-semibold transition-all"
            style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
            <Download size={13} />
            {copy.install}
          </button>
          <button onClick={handleDismiss}
            className="w-7 h-7 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
            aria-label={copy.close}>
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}