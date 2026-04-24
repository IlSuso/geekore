// Bridge between SwipeablePageContainer (gesture source) and
// KeepAliveTabShell (panel renderer) for Instagram-style side-by-side transitions.
// Uses direct DOM manipulation via callbacks — no React re-renders per frame.

type PanelUpdater = (offset: number, activeIdx: number, snap?: boolean) => void

let _updater: PanelUpdater | null = null

export const swipeNavBridge = {
  register(fn: PanelUpdater) { _updater = fn },
  unregister() { _updater = null },
  update(offset: number, activeIdx: number, snap = false) { _updater?.(offset, activeIdx, snap) },
}
