'use client'

import { ArrowUp, Sparkles, X } from 'lucide-react'
import { CategorySelector } from '@/components/feed/CategoryControls'
import { parseCategoryString } from '@/components/feed/CategoryBasics'
import type { FeedFilter } from '@/components/feed/feedUtils'

export function EditPostModal({
  editContent,
  setEditContent,
  onClose,
  onSave,
}: {
  editContent: string
  setEditContent: (value: string) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !window.getSelection()?.toString()) onClose() }}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Modifica post</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition"><X size={18} /></button>
        </div>
        <textarea
          value={editContent}
          onChange={e => setEditContent(e.target.value.slice(0, 2000))}
          rows={5}
          autoFocus
          className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-600 focus:outline-none rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none transition mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-semibold transition">
            Annulla
          </button>
          <button onClick={onSave} disabled={!editContent.trim()} className="px-5 py-2.5 rounded-xl disabled:opacity-40 text-sm font-semibold transition" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
            Salva
          </button>
        </div>
      </div>
    </div>
  )
}

export function NewPostsBanner({
  count,
  onShow,
}: {
  count: number
  onShow: () => void
}) {
  if (count <= 0) return null
  return (
    <div className="sticky top-[52px] z-10 flex justify-center py-2">
      <button
        onClick={onShow}
        className="flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-semibold shadow-lg transition-all hover:scale-105 animate-bounce-in"
        style={{
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          border: '0.5px solid var(--border)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <ArrowUp size={14} />
        {count === 1 ? '1 nuovo post' : `${count} nuovi post`}
      </button>
    </div>
  )
}

export function FeedFilterTabs({
  feedFilter,
  onFilterChange,
  categoryFilter,
  setCategoryFilter,
  labels,
}: {
  feedFilter: FeedFilter
  onFilterChange: (filter: FeedFilter) => void
  categoryFilter: string
  setCategoryFilter: (value: string) => void
  labels: { filterAll: string; filterFollowing: string }
}) {
  return (
    <div className="flex items-stretch mb-0 mt-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/60 px-1">
      {(['all', 'following'] as const).map(filter => (
        <button
          key={filter}
          data-testid={`filter-${filter}`}
          onClick={() => onFilterChange(filter)}
          className={`relative flex-1 py-3 text-[13px] font-bold transition-all ${feedFilter === filter ? '' : 'text-[var(--text-muted)]'}`}
          style={{ color: feedFilter === filter ? 'var(--accent)' : undefined }}
        >
          {filter === 'all' ? labels.filterAll : labels.filterFollowing}
          {feedFilter === filter && (
            <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full" style={{ background: 'var(--accent)' }} />
          )}
        </button>
      ))}

      <div className="flex items-center pr-1">
        <CategorySelector value={categoryFilter} onChange={setCategoryFilter} />
      </div>
    </div>
  )
}

export function MediumTypeChipRow({
  categoryFilter,
  setCategoryFilter,
}: {
  categoryFilter: string
  setCategoryFilter: (value: string) => void
}) {
  const chips = [
    { label: 'Tutto', value: '', color: 'var(--accent)' },
    { label: 'Anime', value: 'Anime', color: 'var(--type-anime)' },
    { label: 'Manga', value: 'Manga', color: 'var(--type-manga)' },
    { label: 'Game', value: 'Videogiochi', color: 'var(--type-game)' },
    { label: 'TV', value: 'Serie TV', color: 'var(--type-tv)' },
    { label: 'Film', value: 'Film', color: 'var(--type-movie)' },
    { label: 'Board', value: 'Giochi da tavolo', color: 'var(--type-board)' },
  ]

  return (
    <div className="-mx-4 border-b border-[var(--border-subtle)] px-4 pb-3 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="gk-label">Medium</p>
        {categoryFilter && (
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className="gk-mono text-[var(--accent)]"
          >
            reset
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {chips.map(chip => {
          const parsedActive = parseCategoryString(categoryFilter)
          const isActive = chip.value === ''
            ? categoryFilter === ''
            : parsedActive?.category === chip.value
          return (
            <button
              key={chip.value || 'all'}
              onClick={() => setCategoryFilter(isActive && chip.value !== '' ? '' : chip.value)}
              className="flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-all"
              style={{
                background: isActive
                  ? (chip.value ? `color-mix(in srgb, ${chip.color} 18%, transparent)` : 'var(--accent)')
                  : 'var(--bg-card)',
                color: isActive
                  ? (chip.value ? chip.color : '#0B0B0F')
                  : 'var(--text-secondary)',
                borderColor: isActive ? chip.color : 'var(--border)',
                boxShadow: isActive && chip.value ? `0 0 22px color-mix(in srgb, ${chip.color} 18%, transparent)` : undefined,
              }}
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: isActive && !chip.value ? '#0B0B0F' : chip.color }} />
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function EmptyFeedState({
  categoryFilter,
  feedFilter,
  labels,
  clearCategoryFilter,
}: {
  categoryFilter: string
  feedFilter: FeedFilter
  labels: { noFollowingTitle: string; emptyTitle: string; noFollowingHint: string; emptyHint: string }
  clearCategoryFilter: () => void
}) {
  return (
    <div className="text-center py-24 px-8">
      <div className="w-16 h-16 rounded-full border-2 border-[var(--border)] flex items-center justify-center mx-auto mb-4">
        <Sparkles size={28} style={{ color: 'var(--accent)' }} />
      </div>
      <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">
        {categoryFilter
          ? `Nessun post per "${parseCategoryString(categoryFilter)?.subcategory || categoryFilter}"`
          : feedFilter === 'following' ? labels.noFollowingTitle : labels.emptyTitle}
      </p>
      <p className="text-[14px] text-[var(--text-secondary)]">
        {categoryFilter
          ? 'Sii il primo a pubblicare in questa categoria!'
          : feedFilter === 'following' ? labels.noFollowingHint : labels.emptyHint}
      </p>
      {categoryFilter && (
        <button onClick={clearCategoryFilter}
          className="mt-4 px-5 py-2 rounded-full text-[13px] font-semibold transition-all"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
          Rimuovi filtro
        </button>
      )}
    </div>
  )
}
