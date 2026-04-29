'use client'
// src/components/ui/Card3DTilt.tsx
// N4: Effetto 3D tilt su hover — perspective CSS + transform rotateX/Y calcolati
// dal mousemove. Su mobile (touch device): nessun effetto → risparmio batteria.

import { useRef, useCallback, ReactNode } from 'react'

interface Card3DTiltProps {
  children: ReactNode
  className?: string
  intensity?: number  // 0–20, default 10
  perspective?: number  // px, default 800
}

export function Card3DTilt({
  children,
  className = '',
  intensity = 10,
  perspective = 800,
}: Card3DTiltProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Nessun effetto su touch device
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return

    const card = cardRef.current
    if (!card) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    rafRef.current = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const deltaX = (e.clientX - centerX) / (rect.width / 2)   // -1 to 1
      const deltaY = (e.clientY - centerY) / (rect.height / 2)  // -1 to 1

      const rotateY = deltaX * intensity
      const rotateX = -deltaY * intensity

      card.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`
      card.style.transition = 'transform 0.1s ease'
    })
  }, [intensity, perspective])

  const handleMouseEnter = useCallback(() => {
    // PERF FIX: will-change attivato solo durante l'hover — non in ogni GPU layer permanente
    const card = cardRef.current
    if (card) card.style.willChange = 'transform'
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const card = cardRef.current
    if (!card) return
    card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
    card.style.transition = 'transform 0.4s ease'
    // Libera il GPU layer non appena il mouse esce
    card.style.willChange = 'auto'
  }, [])

  return (
    <div
      ref={cardRef}
      className={className}
      style={{ transformStyle: 'preserve-3d' }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  )
}