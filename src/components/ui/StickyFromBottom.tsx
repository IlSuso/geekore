'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Wrapper that makes content sticky in a "scroll-until-bottom-then-stick" style.
 * - If the content is shorter than the available viewport: sticks at the top (navHeight).
 * - If the content is taller: the top offset is negative so the sidebar scrolls freely
 *   until its bottom reaches the viewport bottom, then it sticks.
 */
export function StickyFromBottom({
  children,
  navHeight = 64,
  className = '',
}: {
  children: React.ReactNode
  navHeight?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(navHeight)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const h = el.offsetHeight
      setTop(Math.min(navHeight, window.innerHeight - h))
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [navHeight])

  return (
    <div ref={ref} style={{ position: 'sticky', top }} className={className}>
      {children}
    </div>
  )
}
