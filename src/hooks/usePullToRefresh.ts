'use client'
// src/hooks/usePullToRefresh.ts
// Pull-to-refresh stile Instagram con mutex — non si attiva se swipe orizzontale è attivo

import { useEffect, useRef, useState, useCallback } from 'react'
import { gestureState } from './gestureState'

interface Options {
  onRefresh: () => Promise<void>
  threshold?: number
}

interface State {
  pulling: boolean
  refreshing: boolean
  distance: number
}

export function usePullToRefresh({ onRefresh, threshold = 70 }: Options) {
  const [state, setState] = useState<State>({ pulling: false, refreshing: false, distance: 0 })
  const startY = useRef(0)
  const active = useRef(false)
  const loading = useRef(false)

  const onStart = useCallback((e: TouchEvent) => {
    if (loading.current) return
    if (gestureState.swipeActive) return  // swipe orizzontale attivo → no pull
    if (window.scrollY > 4) return
    startY.current = e.touches[0].clientY
    active.current = true
  }, [])

  const onMove = useCallback((e: TouchEvent) => {
    if (!active.current || loading.current) return
    if (gestureState.swipeActive) { active.current = false; gestureState.pullActive = false; return }
    if (window.scrollY > 4) { active.current = false; gestureState.pullActive = false; return }

    const raw = e.touches[0].clientY - startY.current
    const dx = Math.abs(e.touches[0].clientX - (e.touches[0].clientX)) // just for reference

    if (raw <= 0) { setState({ pulling: false, refreshing: false, distance: 0 }); return }

    // Resistenza logaritmica come Instagram
    // Resistenza progressiva: più trascini, più diventa lenta (come IG)
    const dist = Math.min(Math.pow(raw, 0.72) * 1.8, threshold * 1.4)
    setState({ pulling: true, refreshing: false, distance: dist })
    gestureState.pullActive = true
    if (raw > 6) e.preventDefault()
  }, [threshold])

  const onEnd = useCallback(async () => {
    gestureState.pullActive = false   // sempre reset, prima di qualsiasi guard
    if (!active.current || loading.current) return
    active.current = false

    setState(prev => {
      if (prev.distance < threshold * 0.6) {
        return { pulling: false, refreshing: false, distance: 0 }
      }
      loading.current = true
      ;(async () => {
        setState({ pulling: false, refreshing: true, distance: threshold * 0.75 })
        try {
          await onRefresh()
        } catch (err) {
          console.error('[pullToRefresh] onRefresh failed:', err)
        } finally {
          loading.current = false
          setState({ pulling: false, refreshing: false, distance: 0 })
        }
      })()
      return prev
    })
  }, [threshold, onRefresh])

  const onCancel = useCallback(() => {
    active.current = false
    gestureState.pullActive = false
    setState({ pulling: false, refreshing: false, distance: 0 })
  }, [])

  useEffect(() => {
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onCancel)
    }
  }, [onStart, onMove, onEnd, onCancel])

  return state
}