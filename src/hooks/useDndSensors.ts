'use client'
// src/hooks/useDndSensors.ts
// Sensori drag & drop ottimizzati per desktop + touch mobile.

import { useSensors, useSensor, PointerSensor, KeyboardSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export function useDndSensors() {
  return useSensors(
    // Mouse/trackpad/touch: distanza 3px prima di attivare
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    // Tastiera per accessibilità
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
}