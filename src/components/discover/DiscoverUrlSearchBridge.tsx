'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

const VALID_TYPES = new Set(['all', 'anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

export function DiscoverUrlSearchBridge() {
  const searchParams = useSearchParams()
  const q = searchParams.get('q')?.trim() || ''
  const type = searchParams.get('type')?.trim() || ''

  useEffect(() => {
    if (!q && !type) return

    const run = () => {
      if (type && VALID_TYPES.has(type)) {
        const filter = document.querySelector<HTMLButtonElement>(`[data-testid="filter-${type}"]`)
        filter?.click()
      }

      if (q.length >= 2) {
        const input = document.querySelector<HTMLInputElement>('[data-testid="search-input"]')
        if (input && input.value !== q) {
          setNativeInputValue(input, q)
          input.focus()
        }
      }
    }

    // DiscoverPage monta input/filtri nello stesso pass, ma un piccolo defer evita race
    // quando si arriva da Link e il pannello keep-alive sta riattivando la route.
    const t = window.setTimeout(run, 60)
    return () => window.clearTimeout(t)
  }, [q, type])

  return null
}
