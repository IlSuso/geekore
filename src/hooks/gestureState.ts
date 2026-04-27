'use client'
// src/hooks/gestureState.ts
// Stato condiviso tra SwipeablePageContainer, usePullToRefresh e drawer
// per garantire che i gesti non si attivino contemporaneamente

export const gestureState = {
  swipeActive:   false,  // sta avvenendo uno swipe orizzontale tra pagine
  pullActive:    false,  // sta avvenendo un pull-to-refresh
  drawerActive:  false,  // un drawer/modal è aperto — blocca il page-switch swipe
  pageSwipeZone: false,  // il touch è partito dalla fascia nav-zone — forza page-swipe
}