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
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[rgba(230,255,61,0.04)] px-5 py-4">
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
}: {
  feedFilter: FeedFilter
  onFilterChange: (filter: FeedFilter) => void
}) {
  const primaryFilters: Array<{ id: FeedFilter; label: string; hint: string }> = [
    { id: 'all', label: 'Tutti', hint: 'tutta la community' },
    { id: 'following', label: 'Seguiti', hint: 'solo chi segui' },
    { id: 'trending', label: 'In tendenza', hint: 'post più attivi' },
  ]

  return (
    <div className="mb-2 mt-1 flex gap-1 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/72 p-1.5 ring-1 ring-white/5" data-no-swipe="true" data-interactive="true">
      {primaryFilters.map(filter => (
        <button
          key={filter.id}
          type="button"
          data-testid={`filter-${filter.id}`}
          data-no-swipe="true"
          onClick={() => onFilterChange(filter.id)}
          className="relative flex-1 min-h-10 rounded-2xl px-2 py-2 text-[12px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
          title={filter.hint}
          style={feedFilter === filter.id ? { background: 'rgba(230,255,61,0.09)', color: 'var(--accent)' } : { color: 'var(--text-muted)' }}
        >
          {filter.label}
        </button>
      ))}
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
    { label: 'Tutto', value: '', className: 'gk-chip-active' },
    { label: 'Anime', value: 'Anime', className: 'gk-chip-anime' },
    { label: 'Manga', value: 'Manga', className: 'gk-chip-manga' },
    { label: 'Game', value: 'Videogiochi', className: 'gk-chip-game' },
    { label: 'TV', value: 'Serie TV', className: 'gk-chip-tv' },
    { label: 'Film', value: 'Film', className: 'gk-chip-movie' },
    { label: 'Board', value: 'Giochi da tavolo', className: 'gk-chip-board' },
  ]

  return (
    <div className="border-b border-[var(--border-subtle)] pb-3 pt-2" data-no-swipe="true">
      <div className="flex items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-hide" data-no-swipe="true" data-horizontal-scroll="true" aria-label="Filtri tipo media Home">
        {chips.map(chip => {
          const parsedActive = parseCategoryString(categoryFilter)
          const isActive = chip.value === '' ? categoryFilter === '' : parsedActive?.category === chip.value
          return (
            <button
              key={chip.value || 'all'}
              type="button"
              data-no-swipe="true"
              onClick={() => setCategoryFilter(isActive && chip.value !== '' ? '' : chip.value)}
              className={`gk-chip ${isActive ? chip.className : ''} gk-focus-ring`}
              data-active={isActive && chip.value === '' ? 'true' : undefined}
            >
              {chip.label}
            </button>
          )
        })}
        <div className="h-4 w-px shrink-0 bg-[var(--border)]" aria-hidden="true" />
        <CategorySelector value={categoryFilter} onChange={setCategoryFilter} />
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
  const title = categoryFilter
    ? `Nessun post per "${parseCategoryString(categoryFilter)?.subcategory || categoryFilter}"`
    : feedFilter === 'following'
      ? labels.noFollowingTitle
      : feedFilter === 'trending'
        ? 'Nessun trend per ora'
        : feedFilter === 'discovery'
          ? 'Nessuna discovery disponibile'
          : labels.emptyTitle

  const hint = categoryFilter
    ? 'Sii il primo a pubblicare in questa categoria!'
    : feedFilter === 'following'
      ? labels.noFollowingHint
      : feedFilter === 'trending'
        ? 'Quando i post ricevono like o commenti appariranno qui.'
        : feedFilter === 'discovery'
          ? 'Discovery mostra post fuori dalla tua rete quando sono disponibili.'
          : labels.emptyHint

  return (
    <div className="gk-empty-state py-20">
      <Sparkles className="gk-empty-state-icon" style={{ color: 'var(--accent)' }} />
      <p className="gk-empty-state-title">{title}</p>
      <p className="gk-empty-state-subtitle">{hint}</p>
      {categoryFilter && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={clearCategoryFilter}
          className="gk-btn gk-btn-secondary gk-focus-ring mt-3 h-10 px-5 text-[13px]"
        >
          Rimuovi filtro
        </button>
      )}
    </div>
  )
}
