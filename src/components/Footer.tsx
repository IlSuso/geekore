'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from '@/lib/locale'
import { GeekoreWordmark } from '@/components/ui/GeekoreWordmark'

const PRODUCT_LINKS = [
  { href: '/discover', label: 'Discover' },
  { href: '/for-you', label: 'For You' },
  { href: '/trending', label: 'Trending' },
  { href: '/leaderboard', label: 'Classifica' },
  { href: '/settings', label: 'Settings' },
]

const APP_ROUTE_PREFIXES = [
  '/home',
  '/for-you',
  '/library',
  '/discover',
  '/friends',
  '/community',
  '/explore',
  '/trending',
  '/lists',
  '/notifications',
  '/stats',
  '/settings',
  '/profile',
  '/swipe',
  '/wishlist',
  '/leaderboard',
  '/search',
]

const PUBLIC_FOOTER_ROUTES = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/privacy',
  '/terms',
  '/cookies',
])

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function Footer() {
  const pathname = usePathname()
  const { t } = useLocale()

  // La landing ha già il proprio footer/chiusura visuale.
  if (pathname === '/') return null

  // Nelle pagine app logged-in il footer crea grandi vuoti e fa sembrare la UI un sito marketing.
  // Lo lasciamo solo su auth/legal/public routes.
  if (APP_ROUTE_PREFIXES.some(prefix => matchesRoutePrefix(pathname, prefix))) return null
  if (!PUBLIC_FOOTER_ROUTES.has(pathname)) return null

  const linkClass = 'rounded-lg transition-colors hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'
  const legalClass = 'rounded-lg transition-colors hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'

  return (
    <footer
      data-no-swipe="true"
      className="hidden border-t border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(11,11,15,0.98),rgba(11,11,15,1))] px-6 py-8 md:block"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <GeekoreWordmark size="sm" className="opacity-75 transition-opacity hover:opacity-100" />
          <p className="max-w-sm text-xs leading-relaxed text-[var(--text-muted)]">
            Il tuo universo media: library, consigli, community e profilo pubblico nello stesso posto.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[var(--text-muted)]">
          {PRODUCT_LINKS.map(link => (
            <Link key={link.href} href={link.href} data-no-swipe="true" className={linkClass}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <Link href="/privacy" data-no-swipe="true" className={legalClass}>{t.legal.privacy}</Link>
            <span className="text-[var(--border)]">·</span>
            <Link href="/terms" data-no-swipe="true" className={legalClass}>{t.legal.terms}</Link>
            <span className="text-[var(--border)]">·</span>
            <Link href="/cookies" data-no-swipe="true" className={legalClass}>Cookie Policy</Link>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{t.legal.rights}</p>
        </div>
      </div>
    </footer>
  )
}
