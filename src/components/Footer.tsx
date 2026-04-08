'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/locale'
import { Zap } from 'lucide-react'

export function Footer() {
  const { t } = useLocale()

  return (
    <footer className="bg-black border-t border-zinc-900 py-8 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="text-sm font-bold tracking-tighter text-zinc-500">geekore</span>
        </div>

        {/* Legal links */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-600">
          <Link href="/privacy" className="hover:text-zinc-400 transition-colors">{t.legal.privacy}</Link>
          <span className="text-zinc-800">·</span>
          <Link href="/terms" className="hover:text-zinc-400 transition-colors">{t.legal.terms}</Link>
          <span className="text-zinc-800">·</span>
          <Link href="/cookies" className="hover:text-zinc-400 transition-colors">Cookie Policy</Link>
        </div>

        {/* Rights */}
        <p className="text-xs text-zinc-700">{t.legal.rights}</p>
      </div>
    </footer>
  )
}
