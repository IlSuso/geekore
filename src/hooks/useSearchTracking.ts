// DESTINAZIONE: src/hooks/useSearchTracking.ts
// ═══════════════════════════════════════════════════════════════════════════
// V3: Hook per tracciare le ricerche e aggiornare il profilo gusti in tempo reale.
// Da usare nel componente Discover/Search.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useRef } from 'react'

interface TrackSearchOptions {
  query: string
  mediaType?: string
  resultClickedId?: string
  resultClickedType?: string
  resultClickedGenres?: string[]
}

interface TrackTasteDeltaOptions {
  action: 'rating' | 'status_change' | 'wishlist_add' | 'rewatch' | 'progress'
  mediaId: string
  mediaType: string
  genres: string[]
  rating?: number
  prevRating?: number
  status?: string
  prevStatus?: string
  rewatchCount?: number
}

export function useSearchTracking() {
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQueryRef = useRef<string>('')

  /**
   * Traccia una ricerca.
   * - Debounced: aspetta 800ms prima di inviare (evita spam per ogni lettera)
   * - Deduplica query identiche consecutive
   */
  const trackSearch = useCallback((options: TrackSearchOptions) => {
    const { query, mediaType } = options

    if (!query || query.trim().length < 2) return
    if (query.trim() === lastQueryRef.current) return

    if (pendingRef.current) clearTimeout(pendingRef.current)

    pendingRef.current = setTimeout(async () => {
      lastQueryRef.current = query.trim()
      try {
        await fetch('/api/search/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: query.trim(),
            media_type: mediaType || null,
          }),
        })
      } catch {
        // Fail silently — non è critico
      }
    }, 800)
  }, [])

  /**
   * Traccia un click su un risultato di ricerca.
   * Chiamata immediatamente (non debounced).
   */
  const trackSearchClick = useCallback(async (options: TrackSearchOptions) => {
    if (!options.resultClickedId) return
    try {
      await fetch('/api/search/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: options.query.trim(),
          media_type: options.mediaType || null,
          result_clicked_id: options.resultClickedId,
          result_clicked_type: options.resultClickedType || null,
          result_clicked_genres: options.resultClickedGenres || [],
        }),
      })
    } catch {
      // Fail silently
    }
  }, [])

  return { trackSearch, trackSearchClick }
}

/**
 * Hook per aggiornamenti incrementali del profilo gusti.
 * Da chiamare dopo ogni azione significativa dell'utente
 * (rating, cambio status, aggiunta wishlist, rewatch).
 */
export function useTasteUpdate() {
  const updateTaste = useCallback(async (options: TrackTasteDeltaOptions) => {
    try {
      // Fire and forget — non blocca l'UI
      fetch('/api/taste/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: options.action,
          mediaId: options.mediaId,
          mediaType: options.mediaType,
          genres: options.genres,
          rating: options.rating,
          prevRating: options.prevRating,
          status: options.status,
          prevStatus: options.prevStatus,
          rewatchCount: options.rewatchCount,
        }),
      }).catch(() => {})
    } catch {
      // Fail silently
    }
  }, [])

  return { updateTaste }
}