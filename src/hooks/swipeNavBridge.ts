'use client'
// Bridge between SwipeablePageContainer (gesture source) and
// KeepAliveTabShell (panel renderer) for Instagram-style carousel transitions.
//
// SwipeablePageContainer calls notifyStart when horizontal direction is confirmed
// and notifyEnd when the swipe is cancelled or snaps back.
// Completed navigations are cleaned up by pathname-change effects in the shell.

type StartFn = (prevIdx: number | null, nextIdx: number | null) => void
type EndFn = () => void

export const swipeNavBridge = {
  _start: null as StartFn | null,
  _end:   null as EndFn   | null,

  register(onStart: StartFn, onEnd: EndFn) {
    this._start = onStart
    this._end   = onEnd
  },
  unregister() { this._start = null; this._end = null },
  notifyStart(prevIdx: number | null, nextIdx: number | null) { this._start?.(prevIdx, nextIdx) },
  notifyEnd() { this._end?.() },
}
