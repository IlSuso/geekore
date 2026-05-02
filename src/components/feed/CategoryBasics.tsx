'use client'

import type { CSSProperties } from 'react'
import {
  Dices,
  Film,
  Gamepad2,
  Layers,
  Swords,
  Tag,
  Tv,
  type LucideIcon,
} from 'lucide-react'

export const MACRO_CATEGORIES = [
  'Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Giochi da tavolo',
]

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  'Film': Film,
  'Serie TV': Tv,
  'Videogiochi': Gamepad2,
  'Anime': Swords,
  'Manga': Layers,
  'Giochi da tavolo': Dices,
}

export function CategoryIcon({
  category,
  size = 13,
  className = '',
  style,
}: {
  category: string
  size?: number
  className?: string
  style?: CSSProperties
}) {
  const Icon = CATEGORY_ICON_MAP[category] || Tag
  return <Icon size={size} className={className} style={style} />
}

export function parseCategoryString(cat: string | null | undefined): { category: string; subcategory: string } | null {
  if (!cat) return null
  const idx = cat.indexOf(':')
  if (idx === -1) return { category: cat, subcategory: '' }
  return { category: cat.slice(0, idx), subcategory: cat.slice(idx + 1) }
}

const CATEGORY_COLOR: Record<string, string> = {
  'Film': 'bg-red-500',
  'Serie TV': 'bg-purple-500',
  'Videogiochi': 'bg-green-500',
  'Anime': 'bg-sky-500',
  'Manga': 'bg-orange-500',
  'Giochi da tavolo': 'bg-amber-500',
}

export function CategoryBadge({ category, onClick }: { category: string | null | undefined; onClick?: () => void }) {
  if (!category) return null
  const parsed = parseCategoryString(category)
  if (!parsed) return null
  const label = parsed.subcategory ? parsed.subcategory.trim() : parsed.category
  const colorClass = CATEGORY_COLOR[parsed.category] || 'bg-zinc-600'
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white max-w-full overflow-hidden ${colorClass} ${onClick ? 'cursor-pointer opacity-90 hover:opacity-100 transition-opacity' : ''}`}
    >
      <CategoryIcon category={parsed.category} size={11} className="flex-shrink-0" />
      <span className="truncate sm:whitespace-normal sm:overflow-visible">{label}</span>
    </span>
  )
}
