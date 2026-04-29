'use client'
// src/hooks/useInfiniteScroll.ts
// IntersectionObserver per infinite scroll automatico.
// Usalo ovunque c'è paginazione: feed, collezione pubblica, notifiche.

import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  /** Callback chiamata quando l'elemento sentinel entra nel viewport */
  onLoadMore: () => void
  /** Se ci sono altri dati da caricare */
  hasMore: boolean
  /** Se un caricamento è già in corso */
  isLoading: boolean
  /** Margine sotto il fold prima di triggerare (default: "200px") */
  rootMargin?: string
}

/**
 * Restituisce un ref da attaccare all'elemento "sentinel" in fondo alla lista.
 * Quando il sentinel entra nel viewport, chiama `onLoadMore`.
 *
 * Uso:
 * ```tsx
 * const sentinelRef = useInfiniteScroll({ onLoadMore, hasMore, isLoading })
 * return (
 *   <>
 *     {items.map(...)}
 *     <div ref={sentinelRef} />  ← elemento invisibile in fondo
 *   </>
 * )
 * ```
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  rootMargin = '100px', // PERF FIX: 200px era troppo aggressivo su mobile
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasMore && !isLoading) {
        onLoadMore()
      }
    },
    [hasMore, isLoading, onLoadMore]
  )

  useEffect(() => {
    const element = sentinelRef.current
    if (!element) return

    // Cleanup observer precedente
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin,
      threshold: 0,
    })

    observerRef.current.observe(element)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [handleIntersect, rootMargin])

  return sentinelRef
}