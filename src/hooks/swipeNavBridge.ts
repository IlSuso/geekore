'use client'
// src/hooks/swipeNavBridge.ts

type StartFn = (prevIdx: number | null, nextIdx: number | null) => void
type EndFn   = () => void
type DragFn  = (dx: number) => void
// velocity: velocity del dito al rilascio (px/ms da use-gesture)
// _unused: era la durata fissa — ora ignorata, usa spring Motion
type SnapFn  = (targetX: number, velocity: number, _unused: number) => void

export const swipeNavBridge = {
  _start: null as StartFn | null,
  _end:   null as EndFn   | null,
  _drag:  null as DragFn  | null,
  _snap:  null as SnapFn  | null,

  register(onStart: StartFn, onEnd: EndFn, onDrag?: DragFn, onSnap?: SnapFn) {
    this._start = onStart
    this._end   = onEnd
    this._drag  = onDrag ?? null
    this._snap  = onSnap ?? null
  },
  unregister() {
    this._start = null; this._end = null
    this._drag  = null; this._snap = null
  },
  notifyStart(prevIdx: number | null, nextIdx: number | null) { this._start?.(prevIdx, nextIdx) },
  notifyEnd()                                                  { this._end?.() },
  notifyDrag(dx: number)                                       { this._drag?.(dx) },
  notifySnap(targetX: number, velocity: number, _unused: number) { this._snap?.(targetX, velocity, _unused) },
}