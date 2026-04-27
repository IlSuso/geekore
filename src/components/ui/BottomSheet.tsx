'use client'
// src/components/ui/BottomSheet.tsx
// #18: Bottom sheet mobile — sale dal basso con gesture di chiusura verso il basso.
// Pattern iOS/Android standard. Su desktop rimane un modal centrato.
// Supporta: snap points, drag handle, backdrop click per chiudere, animazione fluida.

import { useEffect, useRef, useCallback, useState } from 'react'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  /** Se true, mostra la X in alto a destra */
  showClose?: boolean
  /** Altezza massima come percentuale del viewport (default: 90) */
  maxHeightVh?: number
  children: React.ReactNode
  /** Se true, non chiude cliccando il backdrop */
  persistent?: boolean
}

// Su iOS il bordo sinistro estremo attiva la back gesture di sistema (swipe interattivo).
// Il BottomSheet sale dal basso — uno swipe dal bordo sinistro NON deve spostarlo.
const IS_IOS_BS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const IOS_LEFT_DEAD_ZONE = 30  // px — zona della back gesture iOS

export function BottomSheet({
  open,
  onClose,
  title,
  showClose = true,
  maxHeightVh = 90,
  children,
  persistent = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const dragCurrentY = useRef<number>(0)
  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [mounted, setMounted] = useState(false)

  const historyPushedRef  = useRef(false)
  const closingRef        = useRef(false)
  const scrollContentRef  = useRef<HTMLDivElement>(null)
  // True quando il drag è partito dall'area scrollabile a fine corsa
  const draggingFromScroll = useRef(false)

  // Evita SSR mismatch col portal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Lock scroll body quando aperto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setTranslateY(0)
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Chiudi con Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, persistent, onClose])

  // Back gesture handler — Android usa androidBack (niente pushState),
  // iOS usa pushState + popstate listener
  useEffect(() => {
    if (!open) {
      gestureState.drawerActive = false
      return
    }
    gestureState.drawerActive = true
    const isAndroid = /android/i.test(navigator.userAgent)

    if (isAndroid) {
      const closeSheet = () => { if (!persistent) onClose() }
      androidBack.push(closeSheet)
      return () => {
        gestureState.drawerActive = false
        androidBack.pop(closeSheet)
      }
    }

    // iOS
    history.pushState({ gkSheet: true }, '', location.href)
    historyPushedRef.current = true
    const onPop = (e: PopStateEvent) => {
      if (closingRef.current) { closingRef.current = false; e.stopImmediatePropagation(); return }
      if (!historyPushedRef.current) return
      e.stopImmediatePropagation()
      historyPushedRef.current = false
      if (!persistent) onClose()
    }
    window.addEventListener('popstate', onPop, { capture: true })
    return () => {
      gestureState.drawerActive = false
      window.removeEventListener('popstate', onPop, { capture: true })
      historyPushedRef.current = false
    }
  }, [open, persistent, onClose])

  // ── Drag gesture ────────────────────────────────────────────────────────────

  const onDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY
    dragCurrentY.current = 0
    setIsDragging(true)
  }, [])

  const onDragMove = useCallback((clientY: number) => {
    if (dragStartY.current === null) return
    const delta = clientY - dragStartY.current
    // Permette solo drag verso il basso (delta positivo)
    if (delta > 0) {
      dragCurrentY.current = delta
      setTranslateY(delta)
    }
  }, [])

  const onDragEnd = useCallback(() => {
    setIsDragging(false)
    const sheet = sheetRef.current
    if (!sheet) return
    const sheetHeight = sheet.offsetHeight
    // Se trascinato oltre 40% dell'altezza → chiudi
    if (dragCurrentY.current > sheetHeight * 0.4) {
      onClose()
    } else {
      setTranslateY(0)
    }
    dragStartY.current = null
    dragCurrentY.current = 0
  }, [onClose])

  // Touch handlers per il drag handle
  const handleTouchStart = (e: React.TouchEvent) => {
    if (IS_IOS_BS && e.touches[0].clientX <= IOS_LEFT_DEAD_ZONE) return
    draggingFromScroll.current = false
    onDragStart(e.touches[0].clientY)
  }
  const handleTouchMove = (e: React.TouchEvent) => onDragMove(e.touches[0].clientY)
  const handleTouchEnd = () => onDragEnd()

  // True se il touch è iniziato con il contenuto già a fine corsa
  const startedAtBottom = useRef(false)

  // Touch handlers per il contenuto scrollabile.
  // Il dismiss si attiva in due casi:
  //   1. Il touch inizia con il contenuto già a fine corsa (startedAtBottom)
  //   2. Il contenuto raggiunge la fine corsa DURANTE il drag verso il basso
  const handleContentTouchStart = (e: React.TouchEvent) => {
    if (IS_IOS_BS && e.touches[0].clientX <= IOS_LEFT_DEAD_ZONE) return
    draggingFromScroll.current = false
    dragStartY.current = e.touches[0].clientY
    dragCurrentY.current = 0
    const el = scrollContentRef.current
    startedAtBottom.current = !!el && (el.scrollTop + el.clientHeight >= el.scrollHeight - 1)
  }
  const handleContentTouchMove = (e: React.TouchEvent) => {
    const el = scrollContentRef.current
    if (!el || dragStartY.current === null) return
    const dy = e.touches[0].clientY - dragStartY.current
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1

    if (!draggingFromScroll.current) {
      // Attiva dismiss se: stava già a fine corsa al touch start, oppure ci arriva ora
      if (dy > 8 && (startedAtBottom.current || atBottom)) {
        draggingFromScroll.current = true
        setIsDragging(true)
      } else {
        return // lascia scorrere normalmente il contenuto
      }
    }
    if (draggingFromScroll.current && dy > 0) {
      e.preventDefault() // blocca scroll nativo mentre dismissiamo
      dragCurrentY.current = dy
      setTranslateY(dy)
    }
  }
  const handleContentTouchEnd = () => {
    startedAtBottom.current = false
    if (!draggingFromScroll.current) return
    draggingFromScroll.current = false
    onDragEnd()
  }

  // Mouse handlers (per test su desktop)
  const handleMouseDown = (e: React.MouseEvent) => onDragStart(e.clientY)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragStartY.current !== null) onDragMove(e.clientY)
  }, [onDragMove])
  const handleMouseUp = useCallback(() => {
    if (dragStartY.current !== null) onDragEnd()
  }, [onDragEnd])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  if (!mounted) return null

  const content = (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-50 bg-black/60 backdrop-blur-sm
          transition-opacity duration-300
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        onClick={persistent ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`
          fixed inset-x-0 bottom-0 z-50
          md:inset-0 md:flex md:items-center md:justify-center md:p-4
          transition-transform duration-300 ease-out
          ${open ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
          ${!open && 'md:opacity-0 md:pointer-events-none'}
          ${open && 'md:opacity-100'}
        `}
        style={{
          // Su mobile: applica translateY dal drag
          transform: open
            ? `translateY(${translateY}px)`
            : 'translateY(100%)',
          // Override su md per il modal centrato
          transition: isDragging ? 'none' : undefined,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Panel */}
        <div
          ref={sheetRef}
          className={`
            relative w-full bg-zinc-900 border border-zinc-800
            rounded-t-3xl md:rounded-3xl
            overflow-hidden
            md:max-w-lg md:w-full
            shadow-2xl
          `}
          style={{ maxHeight: `${maxHeightVh}vh` }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle — solo mobile */}
          <div
            className="md:hidden flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            <div className="w-10 h-1 rounded-full bg-zinc-700" />
          </div>

          {/* Header */}
          {(title || showClose) && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              {title && (
                <h2 className="text-base font-semibold text-white">{title}</h2>
              )}
              {showClose && (
                <button
                  onClick={onClose}
                  className="ml-auto p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  aria-label="Chiudi"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          )}

          {/* Scrollable content */}
          <div
            ref={scrollContentRef}
            className="overflow-y-auto overscroll-contain"
            style={{ maxHeight: `calc(${maxHeightVh}vh - 80px)` }}
            onTouchStart={handleContentTouchStart}
            onTouchMove={handleContentTouchMove}
            onTouchEnd={handleContentTouchEnd}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  )

  return createPortal(content, document.body)
}