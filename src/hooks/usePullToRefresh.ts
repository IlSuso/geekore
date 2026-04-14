'use client'
// src/hooks/usePullToRefresh.ts
// Pull-to-refresh stile Instagram:
// - La pagina si abbassa fisicamente seguendo il dito
// - Indicatore spinner circolare appare dall'alto
// - Soglia 72px, resistenza 0.45

import { useEffect, useRef, useState, useCallback } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number
  onlyAtTop?: boolean
}

interface PullState {
  isPulling: boolean
  isRefreshing: boolean
  pullDistance: number   // distanza visiva (con resistenza)
  rawDistance: number    // distanza dito reale
}

export function usePullToRefresh({
  onRefresh,
  threshold = 72,
  onlyAtTop = true,
}: UsePullToRefreshOptions) {
  const [state, setState] = useState<PullState>({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    rawDistance: 0,
  })

  const startYRef = useRef(0)
  const isPullingRef = useRef(false)
  const isRefreshingRef = useRef(false)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshingRef.current) return
    if (onlyAtTop && window.scrollY > 2) return
    startYRef.current = e.touches[0].clientY
    isPullingRef.current = false
  }, [onlyAtTop])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isRefreshingRef.current) return
    if (onlyAtTop && window.scrollY > 2) return

    const raw = e.touches[0].clientY - startYRef.current
    if (raw <= 0) {
      if (isPullingRef.current) {
        isPullingRef.current = false
        setState(s => ({ ...s, isPulling: false, pullDistance: 0, rawDistance: 0 }))
      }
      return
    }

    isPullingRef.current = true

    // Resistenza progressiva: più tiri, meno si muove
    const resistance = 0.45
    const pullDistance = Math.min(raw * resistance, threshold * 1.4)

    setState(s => ({ ...s, isPulling: true, pullDistance, rawDistance: raw }))

    // Previeni scroll nativo solo se stiamo davvero tirando giù
    if (raw > 8) e.preventDefault()
  }, [onlyAtTop, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || isRefreshingRef.current) return
    isPullingRef.current = false

    const currentState = { ...state }
    if (currentState.pullDistance < threshold * 0.55) {
      // Non abbastanza → rimbalzo
      setState({ isPulling: false, isRefreshing: false, pullDistance: 0, rawDistance: 0 })
      return
    }

    // Soglia raggiunta → refresh
    isRefreshingRef.current = true
    setState({ isPulling: false, isRefreshing: true, pullDistance: threshold * 0.6, rawDistance: 0 })

    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(40)

    try {
      await onRefresh()
    } finally {
      isRefreshingRef.current = false
      setState({ isPulling: false, isRefreshing: false, pullDistance: 0, rawDistance: 0 })
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