'use client'
// src/components/ui/NavigationProgress.tsx
// Barra di progresso sottile in cima alla pagina durante la navigazione.
// Intercetta usePathname() per rilevare il cambio di route e mostrare
// una progress bar animata che dà feedback visivo immediato al click.

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)
  const prevPathname = useRef(pathname)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // Pathname cambiato → navigazione completata
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname
      // Porta la barra al 100% e poi nascondila
      setWidth(100)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setVisible(false)
        setWidth(0)
      }, 300)
    }
  }, [pathname])

  // Intercetta i click sui Link per avviare la barra immediatamente
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a')
      if (!target) return
      const href = target.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('#')) return

      // Avvia la barra
      if (timerRef.current) clearTimeout(timerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setVisible(true)
      setWidth(0)

      // Anima fino a ~85% (il resto viene completato al cambio pathname)
      let current = 0
      const animate = () => {
        // Rallenta progressivamente man mano che si avvicina all'85%
        const increment = current < 30 ? 8 : current < 60 ? 4 : current < 80 ? 1.5 : 0.3
        current = Math.min(85, current + increment)
        setWidth(current)
        if (current < 85) {
          rafRef.current = requestAnimationFrame(animate)
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className="hidden md:block fixed top-0 left-0 right-0 z-[200] h-[2px] pointer-events-none"
      aria-hidden
    >
      <div
        className="h-full bg-black md:shadow-[0_0_8px_rgba(230,255,61,0.4)]"
        style={{ background: width > 0 ? '#E6FF3D' : undefined }}
        style={{
          width: `${width}%`,
          transition: width === 100 ? 'width 200ms ease-out' : 'width 80ms linear',
        }}
      />
    </div>
  )
}