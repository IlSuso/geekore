'use client'
// SwipeablePageContainer.tsx
// Navigazione orizzontale stile Instagram: le pagine scorrono con il dito,
// la pagina adiacente compare progressivamente mentre si trascina.

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'

// Ordine delle tab principali (stesso di MOBILE_NAV_ITEMS in Navbar)
const TAB_ORDER = ['/feed', '/discover', '/for-you', '/trending', '/profile/me']

// Soglia minima in px per confermare il cambio pagina
const CONFIRM_THRESHOLD = 80
// Soglia velocità (px/ms) per confermare con gesto veloce
const VELOCITY_THRESHOLD = 0.3

export function SwipeablePageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchStartTime = useRef(0)
  const currentDeltaX = useRef(0)
  const isSwipingHorizontal = useRef<boolean | null>(null) // null = non ancora deciso

  const [dragX, setDragX] = useState(0) // px di traslazione durante il drag
  const [isAnimating, setIsAnimating] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right' | null>(null)

  // Trova indice corrente nell'ordine delle tab
  const currentIndex = TAB_ORDER.findIndex(tab => {
    if (tab === '/profile/me') return pathname.startsWith('/profile/')
    if (tab === '/feed') return pathname === '/feed' || pathname === '/'
    return pathname === tab
  })

  // Non attivare lo swipe se non siamo in una tab principale
  const isMainTab = currentIndex !== -1

  const prevPage = currentIndex > 0 ? TAB_ORDER[currentIndex - 1] : null
  const nextPage = currentIndex < TAB_ORDER.length - 1 ? TAB_ORDER[currentIndex + 1] : null

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (!isMainTab) return
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchStartTime.current = Date.now()
    currentDeltaX.current = 0
    isSwipingHorizontal.current = null
  }, [isMainTab])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!isMainTab || isAnimating) return

    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    // Prima determinazione: orizzontale o verticale?
    if (isSwipingHorizontal.current === null) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return // aspetta
      isSwipingHorizontal.current = Math.abs(deltaX) > Math.abs(deltaY) * 1.2
    }

    if (!isSwipingHorizontal.current) return

    // Blocca lo scroll verticale quando stiamo swippando orizzontalmente
    e.preventDefault()

    currentDeltaX.current = deltaX

    // Non far scorrere se non c'è pagina in quella direzione
    if (deltaX > 0 && !prevPage) return
    if (deltaX < 0 && !nextPage) return

    // Resistenza elastica ai bordi
    const resistance = 0.35
    const clampedDelta = deltaX > 0
      ? Math.min(deltaX * resistance, 60)
      : Math.max(deltaX * resistance, -60)

    setDragX(clampedDelta)
  }, [isMainTab, isAnimating, prevPage, nextPage])

  const onTouchEnd = useCallback(() => {
    if (!isMainTab || isSwipingHorizontal.current !== true) {
      setDragX(0)
      isSwipingHorizontal.current = null
      return
    }

    const deltaX = currentDeltaX.current
    const elapsed = Date.now() - touchStartTime.current
    const velocity = Math.abs(deltaX) / elapsed

    const shouldNavigate =
      Math.abs(deltaX) > CONFIRM_THRESHOLD || velocity > VELOCITY_THRESHOLD

    if (shouldNavigate) {
      if (deltaX > 0 && prevPage) {
        setDirection('right')
        setIsAnimating(true)
        router.push(prevPage)
      } else if (deltaX < 0 && nextPage) {
        setDirection('left')
        setIsAnimating(true)
        router.push(nextPage)
      }
    }

    setDragX(0)
    isSwipingHorizontal.current = null
  }, [isMainTab, prevPage, nextPage, router])

  // Reset animazione quando cambia pagina
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false)
      setDirection(null)
    }, 350)
    return () => clearTimeout(timer)
  }, [pathname])

  // Attacca/rimuovi listeners
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [onTouchStart, onTouchMove, onTouchEnd])

  return (
    <div
      ref={containerRef}
      style={{
        transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
        transition: dragX === 0 ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
        willChange: dragX !== 0 ? 'transform' : 'auto',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}