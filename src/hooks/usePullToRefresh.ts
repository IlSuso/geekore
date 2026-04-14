'use client'
// src/hooks/usePullToRefresh.ts
// Pull-to-refresh nativo su mobile con touch events.
// Mostra un indicatore visivo quando l'utente tira giù la pagina.
// Roadmap #10

import { useEffect, useRef, useState, useCallback } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>
  /** Distanza in px necessaria per triggerare il refresh (default 80) */
  threshold?: number
  /** Disabilita il pull quando la pagina non è in cima (default true) */
  onlyAtTop?: boolean
}

interface PullState {
  isPulling: boolean
  isRefreshing: boolean
  pullDistance: number
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  onlyAtTop = true,
}: UsePullToRefreshOptions) {
  const [state, setState] = useState<PullState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
  })

  const startYRef = useRef<number>(0)
  const currentYRef = useRef<number>(0)
  const isPullingRef = useRef(false)
  const isRefreshingRef = useRef(false)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshingRef.current) return
    // Solo se la pagina è in cima
    if (onlyAtTop && window.scrollY > 10) return

    startYRef.current = e.touches[0].clientY
    isPullingRef.current = true
  }, [onlyAtTop])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPullingRef.current || isRefreshingRef.current) return
    if (onlyAtTop && window.scrollY > 10) { isPullingRef.current = false; return }

    currentYRef.current = e.touches[0].clientY
    const delta = currentYRef.current - startYRef.current

    if (delta <= 0) {
      setState(s => ({ ...s, isPulling: false, pullDistance: 0 }))
      return
    }

    // Resistenza: la distanza percepita è minore di quella effettiva
    const resistance = 0.4
    const pullDistance = Math.min(delta * resistance, threshold * 1.5)

    setState(s => ({ ...s, isPulling: true, pullDistance }))

    // Previeni lo scroll nativo mentre si sta pulling
    if (delta > 5) {
      e.preventDefault()
    }
  }, [onlyAtTop, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || isRefreshingRef.current) return
    isPullingRef.current = false

    const { pullDistance } = state

    if (pullDistance < threshold * 0.4) {
      // Non abbastanza, torna su
      setState({ isPulling: false, isRefreshing: false, pullDistance: 0 })
      return
    }

    // Trigger refresh
    isRefreshingRef.current = true
    setState({ isPulling: false, isRefreshing: true, pullDistance: threshold * 0.6 })

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50)
    }

    try {
      await onRefresh()
    } finally {
      isRefreshingRef.current = false
      setState({ isPulling: false, isRefreshing: false, pullDistance: 0 })
    }
  }, [state, threshold, onRefresh])

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return state
}