'use client'
// src/hooks/gestureState.ts
// Stato condiviso tra useSwipeNavigation e usePullToRefresh
// per garantire che i due gesti non si attivino contemporaneamente

export const gestureState = {
  swipeActive: false,   // sta avvenendo uno swipe orizzontale
  pullActive: false,    // sta avvenendo un pull-to-refresh
}