'use client'

import { Trophy, Tv, Users } from 'lucide-react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { useLocalizedMediaRow } from '@/lib/i18n/clientMediaLocalization'

type PopularTitle = {
  item: {
    title: string
    type: string
    cover_image?: string | null
    external_id?: string | null
  }
  count: number
}

function formatNumber(n: number) {
  return n.toLocaleString('it')
}

export function LocalizedPopularTitleRow({ title, index }: { title: PopularTitle; index: number }) {
  const item = useLocalizedMediaRow(title.item, {
    titleKeys: ['title'],
    coverKeys: ['cover_image'],
    idKeys: ['external_id'],
    typeKeys: ['type'],
  }) || title.item

  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/58 p-3 ring-1 ring-white/5">
      <div className="grid w-8 shrink-0 place-items-center">
        {index < 3 ? (
          <Trophy size={15} className={index === 0 ? 'text-yellow-400' : index === 1 ? 'text-zinc-300' : 'text-amber-600'} />
        ) : (
          <span className="font-mono-data text-[11px] font-black text-[var(--text-muted)]">#{index + 1}</span>
        )}
      </div>
      <div className="h-16 w-11 shrink-0 overflow-hidden rounded-[12px] bg-[var(--bg-secondary)]">
        {item.cover_image ? (
          <img src={item.cover_image} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[var(--text-muted)]">
            <Tv size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-black text-[var(--text-primary)]">{item.title}</p>
        <div className="mt-1">
          <MediaTypeBadge type={item.type} size="xs" />
        </div>
      </div>
      <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300">
        <Users size={11} />
        <span className="font-mono-data text-[11px] font-black">{formatNumber(title.count)}</span>
      </div>
    </div>
  )
}
