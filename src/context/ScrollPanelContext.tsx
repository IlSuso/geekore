'use client'

// src/context/ScrollPanelContext.tsx

import { createContext, useContext } from 'react'
import type { MutableRefObject } from 'react'

interface ScrollPanelCtx {
  panelRef: MutableRefObject<HTMLDivElement | null>
  scrollToTop: (behavior?: ScrollBehavior) => void
}

const ScrollPanelContext = createContext<ScrollPanelCtx>({
  panelRef: { current: null },
  scrollToTop: () => {},
})

export function useScrollPanel() {
  return useContext(ScrollPanelContext)
}

export { ScrollPanelContext }