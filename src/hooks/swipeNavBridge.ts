'use client'
// src/hooks/swipeNavBridge.ts
//
// Bridge tra SwipeablePageContainer (sorgente gesture) e
// KeepAliveTabShell (renderer panel).
//
// v2: aggiunta callback onDrag per passare il delta px in tempo reale
// ai panel fixed, che non seguono il translateX del wrapper SPC.

type StartFn = (prevIdx: number | null, nextIdx: number | null) => void
type EndFn   = () => void
type DragFn  = (dx: number) => void

export const swipeNavBridge = {
  _start: null as StartFn | null,
  _end:   null as EndFn   | null,
  _drag:  null as DragFn  | null,

  register(onStart: StartFn, onEnd: EndFn, onDrag?: DragFn) {
    this._start = onStart
    this._end   = onEnd
    this._drag  = onDrag ?? null
  },
  unregister() { this._start = null; this._end = null; this._drag = null },
  notifyStart(prevIdx: number | null, nextIdx: number | null) { this._start?.(prevIdx, nextIdx) },
  notifyEnd()         { this._end?.() },
  notifyDrag(dx: number) { this._drag?.(dx) },
}