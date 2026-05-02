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
    <div
      data-no-swipe="true"
      data-modal="true"
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !window.getSelection()?.toString()) onClose() }}
    >
      <div
        data-no-swipe="true"
        className="w-full max-w-lg overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.08),rgba(139,92,246,0.055),transparent)] px-5 py-4">
          <div>
            <p className="gk-label text-[var(--accent)]">Post editor</p>
            <h3 className="gk-title text-[var(--text-primary)]">Modifica post</h3>
          </div>
          <button type="button" data-no-swipe="true" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--text-muted)] transition hover:text-white" aria-label="Chiudi editor post">
            <X size={17} />
          </button>
        </div>
        <div className="p-5">
          <textarea
            data-no-swipe="true"
            value={editContent}
            onChange={e => setEditContent(e.target.value.slice(0, 2000))}
            rows={5}
            autoFocus
            className="mb-4 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="gk-mono text-[var(--text-muted)]">{editContent.length}/2000</span>
            <div className="flex gap-2" data-no-swipe="true">
              <button type="button" data-no-swipe="true" onClick={onClose} className="rounded-2xl border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition hover:text-white">
                Annulla
              </button>
              <button type="button" data-no-swipe="true" onClick={onSave} disabled={!editContent.trim()} className="rounded-2xl px-5 py-2.5 text-sm font-black transition disabled:opacity-40" style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
                Salva
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NewPostsBanner({ count, onShow }: { count: number; onShow: () => void }) {
  if (count <= 0) return null
  return (
    <div className="sticky top-[52px] z-10 flex justify-center py-2 pointer-events-none" data-no-swipe="true">
      <button
        type="button"
        onClick={onShow}
        data-no-swipe="true"
        className="pointer-events-auto flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-black shadow-lg transition-all hover:scale-105 animate-bounce-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        style={{ background: 'var(--accent)', color: '#0B0B0F', boxShadow: '0 4px 24px rgba(230,255,61,0.20)' }}
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
    <div className="mb-0 mt-1 flex items-stretch rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/80 p-1 ring-1 ring-white/5" data-no-swipe="true" data-interactive="true">
      {(['all', 'following'] as const).map(filter => (
        <button
          key={filter}
          type="button"
          data-testid={`filter-${filter}`}
          data-no-swipe="true"
          onClick={() => onFilterChange(filter)}
          className="relative flex-1 rounded-xl py-2.5 text-[13px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
          style={feedFilter === filter ? { background: 'rgba(230,255,61,0.09)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
        >
          {filter === 'all' ? labels.filterAll : labels.filterFollowing}
        </button>
      ))}

      <div className="flex items-center pr-1" data-no-swipe="true">
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
    <div className="-mx-4 border-b border-[var(--border-subtle)] px-4 pb-3 pt-3" data-no-swipe="true">
      <div className="mb-2 flex items-center justify-between">
        <p className="gk-label">Medium</p>
        {categoryFilter && (
          <button type="button" onClick={() => setCategoryFilter('')} data-no-swipe="true" className="gk-mono text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 rounded-lg px-1">
            reset
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide" data-no-swipe="true" data-horizontal-scroll="true">
        {chips.map(chip => {
          const parsedActive = parseCategoryString(categoryFilter)
          const isActive = chip.value === '' ? categoryFilter === '' : parsedActive?.category === chip.value
          return (
            <button
              key={chip.value || 'all'}
              type="button"
              data-no-swipe="true"
              onClick={() => setCategoryFilter(isActive && chip.value !== '' ? '' : chip.value)}
              className="flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
              style={{
                background: isActive ? (chip.value ? `color-mix(in srgb, ${chip.color} 18%, transparent)` : 'var(--accent)') : 'var(--bg-card)',
                color: isActive ? (chip.value ? chip.color : '#0B0B0F') : 'var(--text-secondary)',
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
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-8 py-20 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.06)]">
        <Sparkles size={28} style={{ color: 'var(--accent)' }} />
      </div>
      <p className="gk-headline mb-1 text-[var(--text-primary)]">
        {categoryFilter
          ? `Nessun post per "${parseCategoryString(categoryFilter)?.subcategory || categoryFilter}"`
          : feedFilter === 'following' ? labels.noFollowingTitle : labels.emptyTitle}
      </p>
      <p className="gk-body mx-auto max-w-sm">
        {categoryFilter
          ? 'Sii il primo a pubblicare in questa categoria!'
          : feedFilter === 'following' ? labels.noFollowingHint : labels.emptyHint}
      </p>
      {categoryFilter && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={clearCategoryFilter}
          className="mt-5 rounded-2xl border border-[var(--border)] px-5 py-2 text-[13px] font-bold text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        >
          Rimuovi filtro
        </button>
      )}
    </div>
  )
}
