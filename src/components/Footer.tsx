'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from '@/lib/locale'
import { GeekoreWordmark } from '@/components/ui/GeekoreWordmark'

export function Footer() {
  const pathname = usePathname()
  const { t } = useLocale()

  if (pathname === '/') return null

  return (
    <footer className="hidden md:block border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] px-6 py-8">
      <div className="max-w-screen-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <GeekoreWordmark size="sm" className="opacity-70 hover:opacity-100 transition-opacity" />
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <Link href="/privacy" className="hover:text-[var(--text-secondary)] transition-colors">{t.legal.privacy}</Link>
          <span className="text-[var(--border)]">·</span>
          <Link href="/terms" className="hover:text-[var(--text-secondary)] transition-colors">{t.legal.terms}</Link>
          <span className="text-[var(--border)]">·</span>
          <Link href="/cookies" className="hover:text-[var(--text-secondary)] transition-colors">Cookie Policy</Link>
        </div>
        <p className="text-xs text-[var(--text-muted)]">{t.legal.rights}</p>
      </div>
    </footer>
  )
}
