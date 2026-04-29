'use client'
// src/hooks/swipeNavBridge.ts

type StartFn   = (prevIdx: number | null, nextIdx: number | null) => void
type EndFn     = () => void
type DragFn    = (dx: number) => void
// velocity: velocity del dito al rilascio (px/ms da use-gesture)
// _unused: era la durata fissa — ora ignorata, usa spring Motion
type SnapFn    = (targetX: number, velocity: number, _unused: number) => void
// resolve: chiamata da SwipeMode per delegare la decisione navigate/snap-back
// a SwipeablePageContainer che conosce prevTab/nextTab.
// dx = spostamento totale in px, vx = velocity stimata in px/ms
type ResolveFn = (dx: number, vx: number) => void

export const swipeNavBridge = {
  _start:   null as StartFn   | null,
  _end:     null as EndFn     | null,
  _drag:    null as DragFn    | null,
  _snap:    null as SnapFn    | null,
  _resolve: null as ResolveFn | null,

  register(onStart: StartFn, onEnd: EndFn, onDrag?: DragFn, onSnap?: SnapFn, onResolve?: ResolveFn) {
    this._start   = onStart
    this._end     = onEnd
    this._drag    = onDrag    ?? null
    this._snap    = onSnap    ?? null
    this._resolve = onResolve ?? null
  },
  unregister() {
    this._start = null; this._end = null
    this._drag  = null; this._snap = null; this._resolve = null
  },
  notifyStart(prevIdx: number | null, nextIdx: number | null) { this._start?.(prevIdx, nextIdx) },
  notifyEnd()                                                  { this._end?.() },
  notifyDrag(dx: number)                                       { this._drag?.(dx) },
  notifySnap(targetX: number, velocity: number, _unused: number) { this._snap?.(targetX, velocity, _unused) },
  // Chiamato da SwipeMode al touchend della zona page: delega la decisione
  // navigate vs snap-back a SwipeablePageContainer che ha il contesto dei tab.
  notifyResolve(dx: number, vx: number)                       { this._resolve?.(dx, vx) },
}