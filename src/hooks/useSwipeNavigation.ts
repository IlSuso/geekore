'use client'
// Swipe orizzontale tra le tab principali — stile Instagram
// Sinistra → pagina successiva, Destra → pagina precedente
// Safe zone 24px sui bordi laterali per non conflittare con Android back gesture

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const TAB_ORDER = ['/home', '/discover', '/for-you', '/trending', '/profile/me']

// Larghezza safe zone laterale in px — Android usa ~20-24px per le gesture di sistema
const EDGE_SAFE_ZONE = 24

export function useSwipeNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      const x = touch.clientX
      const screenW = window.innerWidth

      // ── Safe zone ──────────────────────────────────────────────────────────
      // Se il touch inizia entro EDGE_SAFE_ZONE px dal bordo sinistro o destro,
      // lasciamo passare l'evento al sistema (Android back gesture / system nav).
      if (x <= EDGE_SAFE_ZONE || x >= screenW - EDGE_SAFE_ZONE) return

      // Non attivare su elementi non-swipeable
      const target = e.target as HTMLElement
      if (target.closest('[data-no-swipe], input, textarea, select, [role="slider"]')) return

      startX.current = x
      startY.current = touch.clientY
      active.current = true
    }

    const onMove = (e: TouchEvent) => {
      if (!active.current) return
      const dx = e.touches[0].clientX - startX.current
      const dy = e.touches[0].clientY - startY.current
      // Se il movimento è prevalentemente verticale, disattiva swipe
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && Math.abs(dy) > 10) {
        active.current = false
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (!active.current) return
      active.current = false

      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current

      // Deve essere prevalentemente orizzontale e abbastanza deciso
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return

      const currentIndex = TAB_ORDER.findIndex(
        p => pathname === p || (p === '/profile/me' && pathname.startsWith('/profile/'))
      )
      if (currentIndex === -1) return

      if (dx < -60 && currentIndex < TAB_ORDER.length - 1) {
        router.push(TAB_ORDER[currentIndex + 1])
      } else if (dx > 60 && currentIndex > 0) {
        router.push(TAB_ORDER[currentIndex - 1])
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [pathname, router])
}