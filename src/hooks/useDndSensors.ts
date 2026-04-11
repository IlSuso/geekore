'use client'
// src/hooks/useDndSensors.ts
// Sensori drag & drop ottimizzati per desktop + touch mobile.
// Sostituisce il solo PointerSensor nel profilo che non funziona bene su iOS/Android.

import { useSensors, useSensor, PointerSensor, KeyboardSensor, TouchSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export function useDndSensors() {
  return useSensors(
    // Touch: delay 200ms per distinguere scroll da drag
    // senza delay il sistema confonde il drag verticale con lo scroll della pagina
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    // Mouse/trackpad: distanza 5px prima di attivare
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    // Tastiera per accessibilità
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
}