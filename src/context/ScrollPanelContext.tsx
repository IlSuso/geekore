'use client'

// src/context/ScrollPanelContext.tsx

import { createContext, useContext } from 'react'
import type { MutableRefObject } from 'react'

interface ScrollPanelCtx {
  panelRef: MutableRefObject<HTMLDivElement | null>
  scrollToTop: (behavior?: ScrollBehavior) => void
  current?: HTMLDivElement | null
}

const defaultPanelRef: MutableRefObject<HTMLDivElement | null> = { current: null }

const ScrollPanelContext = createContext<ScrollPanelCtx>({
  panelRef: defaultPanelRef,
  scrollToTop: () => {},
  current: null,
})

export function useScrollPanel() {
  const ctx = useContext(ScrollPanelContext)

  // Backward-compatible bridge:
  // older pages sometimes do `const scrollRef = useScrollPanel()` and then
  // pass `ref={scrollRef}` / `containerRef={scrollRef}` directly.
  // React refs must expose `.current`, while the context shape exposes
  // `.panelRef.current`. This getter/setter makes the context object valid
  // for both usages without changing all consumers at once.
  if (!Object.prototype.hasOwnProperty.call(ctx, 'current')) {
    Object.defineProperty(ctx, 'current', {
      configurable: true,
      enumerable: false,
      get() {
        return ctx.panelRef.current
      },
      set(value: HTMLDivElement | null) {
        ctx.panelRef.current = value
      },
    })
  }

  return ctx as ScrollPanelCtx & MutableRefObject<HTMLDivElement | null>
}

export { ScrollPanelContext }