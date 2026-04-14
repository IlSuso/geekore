// src/hooks/useHoverPrefetch.ts
// Precaricare una route Next.js quando l'utente passa il mouse su un link
// (o inizia il touch su mobile). Questo aggiunge ~100-200ms di vantaggio
// rispetto al click, rendendo la navigazione percepita come istantanea.
//
// Uso:
//   const { handlers } = useHoverPrefetch('/profile/qualcuno')
//   <Link href="..." {...handlers}>...</Link>

'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'

export function useHoverPrefetch(href: string) {
  const router = useRouter()
  const prefetchedRef = useRef(false)

  const prefetch = useCallback(() => {
    if (!prefetchedRef.current && href) {
      router.prefetch(href)
      prefetchedRef.current = true
    }
  }, [router, href])

  return {
    handlers: {
      onMouseEnter: prefetch,
      onTouchStart: prefetch,
      onFocus: prefetch,
    },
  }
}