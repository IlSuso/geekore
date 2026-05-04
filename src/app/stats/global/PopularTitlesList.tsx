'use client'

import { useEffect, useState } from 'react'
import { Trophy, Tv, Users } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { useLocale } from '@/lib/locale'
import { localizeMediaRows } from '@/lib/i18n/clientMediaLocalization'

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

type PopularTitle = {
  count: number
  item: Record<string, any>
}

export function PopularTitlesList({ titles }: { titles: PopularTitle[] }) {
  const { locale } = useLocale()
  const [localizedTitles, setLocalizedTitles] = useState(titles)

  useEffect(() => {
    let cancelled = false
    localizeMediaRows(titles.map(title => title.item), locale).then(items => {
      if (cancelled) return
      setLocalizedTitles(titles.map((title, index) => ({ ...title, item: items[index] || title.item })))
    })
    return () => { cancelled = true }
  }, [titles, locale])

  if (localizedTitles.length === 0) return null

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <Trophy size={15} className="text-[var(--accent)]" />
        <h2 className="text-[12px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{locale === 'en' ? 'Most added by the community' : 'Più aggiunti dalla community'}</h2>
      </div>
      <div className="space-y-2.5">
        {localizedTitles.map((title, index) => (
          <div key={`${title.item.type}-${title.item.external_id || title.item.title}`} className="flex items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/58 p-3 ring-1 ring-white/5">
            <div className="grid w-8 shrink-0 place-items-center">
              {index < 3 ? (
                <Trophy size={15} className={index === 0 ? 'text-yellow-400' : index === 1 ? 'text-zinc-300' : 'text-amber-600'} />
              ) : (
                <span className="font-mono-data text-[11px] font-black text-[var(--text-muted)]">#{index + 1}</span>
              )}
            </div>
            <div className="h-16 w-11 shrink-0 overflow-hidden rounded-[12px] bg-[var(--bg-secondary)]">
              {title.item.cover_image ? (
                <img src={title.item.cover_image} alt={title.item.title} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="grid h-full w-full place-items-center text-[var(--text-muted)]">
                  <Tv size={18} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-black text-[var(--text-primary)]">{title.item.title}</p>
              <div className="mt-1">
                <MediaTypeBadge type={title.item.type} size="xs" />
              </div>
            </div>
            <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300">
              <Users size={11} />
              <span className="font-mono-data text-[11px] font-black">{formatNumber(title.count)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
