'use client'
// src/hooks/useDndSensors.ts
// Sensori drag & drop ottimizzati per desktop + touch mobile.
// MouseSensor attiva su 3px — TouchSensor richiede 200ms di long-press
// per evitare drag accidentali durante scroll su mobile.

import { useSensors, useSensor, MouseSensor, TouchSensor, KeyboardSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export function useDndSensors() {
  return useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 3 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
}