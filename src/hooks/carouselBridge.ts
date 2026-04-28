// src/hooks/carouselBridge.ts
// Singleton per controllare il carosello da componenti fuori dall'albero React
// (es. Navbar che è sibling di KeepAliveTabShell nel layout).

type ScrollFn = (idx: number) => void

let _scrollToIdx: ScrollFn | null = null

export const carouselBridge = {
  register(fn: ScrollFn)   { _scrollToIdx = fn },
  unregister()             { _scrollToIdx = null },
  scrollToIdx(idx: number) { _scrollToIdx?.(idx) },
}
