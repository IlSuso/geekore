'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/locale'
import { Zap } from 'lucide-react'
import { usePathname } from 'next/navigation'

export function Footer() {
  const { t } = useLocale()
  const pathname = usePathname()

  // La landing ha il suo footer inline, il global Footer non serve lì
  if (pathname === '/') return null

  return (
    <footer className="bg-black border-t border-zinc-900 py-8 px-6 mb-16 md:mb-0">
      <div className="max-w-screen-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="text-sm font-bold tracking-tighter text-zinc-500">geekore</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-600">
          <Link href="/privacy" className="hover:text-zinc-400 transition-colors">{t.legal.privacy}</Link>
          <span className="text-zinc-800">·</span>
          <Link href="/terms" className="hover:text-zinc-400 transition-colors">{t.legal.terms}</Link>
          <span className="text-zinc-800">·</span>
          <Link href="/cookies" className="hover:text-zinc-400 transition-colors">Cookie Policy</Link>
        </div>
        <p className="text-xs text-zinc-700">{t.legal.rights}</p>
      </div>
    </footer>
  )
}