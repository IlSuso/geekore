'use client'
// src/hooks/androidBack.ts
//
// Gestione centralizzata della back gesture Android nella PWA.
//
// STRATEGIA: "history cuscinetto"
//   All'avvio teniamo sempre una entry extra nello stack:
//     [start_url, cuscinetto]
//   Quando Android fa back, consuma il cuscinetto → popstate.
//   Noi intercettiamo, decidiamo cosa fare, e rifacciamo subito pushState
//   per ricaricare il cuscinetto (tranne quando vogliamo uscire dall'app).
//
//   I drawer/modal registrano una callback di chiusura invece di fare
//   pushState da soli — così non aggiungono entries extra che Android
//   userebbe per mostrare l'anteprima dello scorrimento.

type CloseCallback = () => void

const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

// Registry delle callback di chiusura drawer/modal (LIFO — ultimo aperto, primo chiuso)
const closeCallbacks: CloseCallback[] = []

export const androidBack = {
  // Chiamato all'apertura di un drawer/modal
  push(onClose: CloseCallback) {
    if (!IS_ANDROID) return
    closeCallbacks.push(onClose)
  },

  // Chiamato alla chiusura di un drawer/modal
  pop(onClose: CloseCallback) {
    if (!IS_ANDROID) return
    const i = closeCallbacks.lastIndexOf(onClose)
    if (i !== -1) closeCallbacks.splice(i, 1)
  },

  // Chiamato dall'handler centrale quando arriva un popstate
  // Restituisce true se ha gestito lui, false se deve gestire la navigazione
  handleBack(): boolean {
    if (closeCallbacks.length > 0) {
      const cb = closeCallbacks[closeCallbacks.length - 1]
      cb()
      return true
    }
    return false
  },

  get hasOpenLayer() {
    return closeCallbacks.length > 0
  },

  // Chiude tutti i layer aperti — usato quando l'utente naviga via navbar.
  closeAll() {
    for (let i = closeCallbacks.length - 1; i >= 0; i--) {
      try { closeCallbacks[i]() } catch {}
    }
    closeCallbacks.length = 0
  },
}