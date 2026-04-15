'use client'
// Swipe orizzontale tra le tab principali — stile Instagram
// Sinistra → pagina successiva, Destra → pagina precedente

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const TAB_ORDER = ['/feed', '/discover', '/for-you', '/trending', '/profile/me']

export function useSwipeNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      // Non attivare se si sta tirando giù (pull-to-refresh) o su elementi scrollabili
      const target = e.target as HTMLElement
      const isScrollable = target.closest('[data-no-swipe], input, textarea, select, [role="slider"]')
      if (isScrollable) return
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
      active.current = true
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
        // Swipe sinistra → pagina successiva
        router.push(TAB_ORDER[currentIndex + 1])
      } else if (dx > 60 && currentIndex > 0) {
        // Swipe destra → pagina precedente
        router.push(TAB_ORDER[currentIndex - 1])
      }
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
