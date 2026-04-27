'use client'
// src/hooks/usePullToRefresh.ts
// Pull-to-refresh stile Instagram con mutex — non si attiva se swipe orizzontale è attivo

import { useEffect, useRef, useState, useCallback, useContext } from 'react'
import { gestureState } from './gestureState'
import { ScrollPanelContext } from '@/context/ScrollPanelContext'

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

  // Legge il panelRef dal context — è il div scrollabile reale (non window)
  const { panelRef } = useContext(ScrollPanelContext)

  useEffect(() => {
    if (!enabled) {
      active.current = false
      gestureState.pullActive = false
      setState({ pulling: false, refreshing: false, distance: 0 })
    }
  }, [enabled])

  const getScrollTop = useCallback(() => {
    // Il panel usa overflow-y:auto su un div fisso — window.scrollY è sempre 0.
    // Leggiamo direttamente lo scrollTop del container reale.
    return panelRef.current?.scrollTop ?? 0
  }, [panelRef])

  const onStart = useCallback((e: TouchEvent) => {
    if (!enabled) return
    if (loading.current) return
    if (gestureState.swipeActive) return
    // Attiva SOLO se il panel è in cima (scrollTop <= 4)
    if (getScrollTop() > 4) return
    const x = e.touches[0].clientX
    const w = window.innerWidth
    if (x <= 72 || x >= w - 72) return
    startY.current = e.touches[0].clientY
    startX.current = x
    active.current = true
  }, [enabled, getScrollTop])

  const onMove = useCallback((e: TouchEvent) => {
    if (!enabled || !active.current || loading.current) return
    if (gestureState.swipeActive) { active.current = false; return }
    // Controlla di nuovo durante il move — l'utente potrebbe aver scrollato
    if (getScrollTop() > 4) { active.current = false; return }

    const raw = e.touches[0].clientY - startY.current
    const dx  = Math.abs(e.touches[0].clientX - startX.current)

    if (raw <= 0) { setState({ pulling: false, refreshing: false, distance: 0 }); return }
    if (dx > raw * 0.8) { active.current = false; return }
    if (raw < 8) return

    // Resistenza progressiva identica a Instagram
    const dist = Math.min(Math.pow(raw, 0.72) * 1.8, threshold * 1.4)
    setState({ pulling: true, refreshing: false, distance: dist })
    gestureState.pullActive = true
    e.preventDefault()
  }, [enabled, threshold, getScrollTop])

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
