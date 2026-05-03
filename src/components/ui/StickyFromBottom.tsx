'use client'

import { useEffect, useRef, useState } from 'react'

function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node = el?.parentElement || null

  while (node) {
    const style = window.getComputedStyle(node)
    const overflowY = style.overflowY

    if (/(auto|scroll|overlay)/.test(overflowY)) {
      return node
    }

    node = node.parentElement
  }

  return window
}

function getViewportHeight(scrollParent: HTMLElement | Window): number {
  if (scrollParent instanceof HTMLElement) {
    return scrollParent.clientHeight
  }

  return window.innerHeight
}

/**
 * Twitter-like sticky sidebar.
 *
 * Behaviour:
 * - the sidebar stays in the normal document flow;
 * - it scrolls together with the page;
 * - if it is taller than the available viewport, it keeps scrolling until its
 *   bottom reaches the viewport bottom, then it sticks there;
 * - it never creates an inner scrollbar.
 *
 * Important: sticky is relative to the nearest scrolling ancestor. In Geekore
 * tabs the scroll container is `.gk-tab-panel`, not `window`, so this component
 * measures the nearest scroll parent instead of relying on `window.innerHeight`.
 */
export function StickyFromBottom({
  children,
  navHeight = 64,
  bottomOffset = 16,
  className = '',
}: {
  children: React.ReactNode
  navHeight?: number
  bottomOffset?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(navHeight)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let scrollParent: HTMLElement | Window = window

    const update = () => {
      scrollParent = findScrollParent(el)

      const viewportHeight = getViewportHeight(scrollParent)
      const contentHeight = el.offsetHeight
      const shortTop = navHeight
      const bottomLockedTop = viewportHeight - contentHeight - bottomOffset

      setTop(Math.min(shortTop, bottomLockedTop))
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)

    window.addEventListener('resize', update)

    if (scrollParent instanceof HTMLElement) {
      scrollParent.addEventListener('scroll', update, { passive: true })
    } else {
      window.addEventListener('scroll', update, { passive: true })
    }

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)

      if (scrollParent instanceof HTMLElement) {
        scrollParent.removeEventListener('scroll', update)
      } else {
        window.removeEventListener('scroll', update)
      }
    }
  }, [navHeight, bottomOffset])

  return (
    <div
      ref={ref}
      style={{ position: 'sticky', top }}
      className={className}
      data-twitter-sticky-sidebar
    >
      {children}
    </div>
  )
}