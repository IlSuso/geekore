'use client'
// Pull-to-refresh stile Instagram:
// Restituisce pullDistance per spostare il main con transform

import { useEffect, useRef, useState, useCallback } from 'react'

interface Options {
  onRefresh: () => Promise<void>
  threshold?: number
}

interface State {
  pulling: boolean
  refreshing: boolean
  distance: number   // distanza visiva con resistenza
}

export function usePullToRefresh({ onRefresh, threshold = 70 }: Options) {
  const [state, setState] = useState<State>({ pulling: false, refreshing: false, distance: 0 })
  const startY = useRef(0)
  const active = useRef(false)
  const loading = useRef(false)

  const onStart = useCallback((e: TouchEvent) => {
    if (loading.current) return
    if (window.scrollY > 4) return
    startY.current = e.touches[0].clientY
    active.current = true
  }, [])

  const onMove = useCallback((e: TouchEvent) => {
    if (!active.current || loading.current) return
    if (window.scrollY > 4) { active.current = false; return }
    const raw = e.touches[0].clientY - startY.current
    if (raw <= 0) { setState({ pulling: false, refreshing: false, distance: 0 }); return }
    // Resistenza logaritmica come Instagram
    const dist = Math.min(raw * 0.5, threshold * 1.5)
    setState({ pulling: true, refreshing: false, distance: dist })
    if (raw > 6) e.preventDefault()
  }, [threshold])

  const onEnd = useCallback(async () => {
    if (!active.current || loading.current) return
    active.current = false
    setState(prev => {
      if (prev.distance < threshold * 0.6) {
        return { pulling: false, refreshing: false, distance: 0 }
      }
      // Soglia raggiunta: rimane giù mentre carica
      loading.current = true
      ;(async () => {
        if (navigator.vibrate) navigator.vibrate(35)
        setState({ pulling: false, refreshing: true, distance: threshold * 0.75 })
        await onRefresh()
        loading.current = false
        setState({ pulling: false, refreshing: false, distance: 0 })
      })()
      return prev
    })
  }, [threshold, onRefresh])

  useEffect(() => {
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [onStart, onMove, onEnd])

  return state
}
