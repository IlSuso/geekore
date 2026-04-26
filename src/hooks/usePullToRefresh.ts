'use client'
// src/hooks/usePullToRefresh.ts
// Pull-to-refresh stile Instagram con mutex — non si attiva se swipe orizzontale è attivo

import { useEffect, useRef, useState, useCallback } from 'react'
import { gestureState } from './gestureState'

interface Options {
  onRefresh: () => Promise<void>
  threshold?: number
  enabled?: boolean
}

interface State {
  pulling: boolean
  refreshing: boolean
  distance: number
}

export function usePullToRefresh({ onRefresh, threshold = 70, enabled = true }: Options) {
  const [state, setState] = useState<State>({ pulling: false, refreshing: false, distance: 0 })
  const startY = useRef(0)
  const startX = useRef(0)
  const active = useRef(false)
  const loading = useRef(false)

  // Clean up when disabled (e.g. panel hidden as keep-alive)
  useEffect(() => {
    if (!enabled) {
      active.current = false
      gestureState.pullActive = false
      setState({ pulling: false, refreshing: false, distance: 0 })
    }
  }, [enabled])

  const onStart = useCallback((e: TouchEvent) => {
    if (!enabled) return
    if (loading.current) return
    if (gestureState.swipeActive) return  // swipe orizzontale attivo → no pull
    if (window.scrollY > 4) return
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
    active.current = true
  }, [enabled])

  const onMove = useCallback((e: TouchEvent) => {
    if (!enabled || !active.current || loading.current) return
    if (gestureState.swipeActive) { active.current = false; return }
    if (window.scrollY > 4) { active.current = false; return }

    const raw = e.touches[0].clientY - startY.current
    const dx  = Math.abs(e.touches[0].clientX - startX.current)

    if (raw <= 0) { setState({ pulling: false, refreshing: false, distance: 0 }); return }

    // If the gesture is more horizontal than vertical, cancel pull so
    // SwipeablePageContainer can claim it as a page-switch swipe.
    if (dx > raw * 0.8) { active.current = false; return }

    // Wait for minimum vertical commitment before locking out horizontal swipe
    if (raw < 8) return

    // Resistenza progressiva come Instagram
    const dist = Math.min(Math.pow(raw, 0.72) * 1.8, threshold * 1.4)
    setState({ pulling: true, refreshing: false, distance: dist })
    gestureState.pullActive = true
    e.preventDefault()
  }, [enabled, threshold])

  const onEnd = useCallback(async () => {
    if (!active.current || loading.current) return
    active.current = false
    gestureState.pullActive = false

    setState(prev => {
      if (prev.distance < threshold * 0.6) {
        return { pulling: false, refreshing: false, distance: 0 }
      }
      loading.current = true
      ;(async () => {
        setState({ pulling: false, refreshing: true, distance: threshold * 0.75 })
        await onRefresh()
        loading.current = false
        setState({ pulling: false, refreshing: false, distance: 0 })
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