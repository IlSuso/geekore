'use client'

import { PartyPopper, Plus } from 'lucide-react'
import { SkeletonFeedPost } from '@/components/ui/SkeletonCard'

export function FeedLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="relative min-h-screen pb-24 pt-0 xl:pb-6">
        <div className="flex min-h-screen items-start lg:pl-[360px]">
          <div className="min-w-0 flex-1">
            <div className="mx-auto max-w-[680px] px-4">
              <div className="my-4 flex items-center gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3.5 ring-1 ring-white/5 animate-pulse">
                <div className="h-10 w-10 flex-shrink-0 rounded-2xl bg-[var(--bg-secondary)]" />
                <div className="h-3.5 w-48 rounded-full bg-[var(--bg-secondary)]" />
              </div>

              <div className="mb-1 mt-1 flex items-stretch rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/60 p-1">
                <div className="flex flex-1 justify-center py-3">
                  <div className="h-3.5 w-10 animate-pulse rounded-full bg-[var(--bg-secondary)]" />
                </div>
                <div className="flex flex-1 justify-center py-3">
                  <div className="h-3.5 w-20 animate-pulse rounded-full bg-[var(--bg-secondary)]" />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-3">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonFeedPost key={i} />)}
              </div>
            </div>
          </div>

          <div className="hidden w-[420px] flex-shrink-0 space-y-6 px-4 pt-4 animate-pulse xl:block">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-4 h-4 w-40 rounded-full bg-[var(--bg-secondary)]" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="h-[88px] w-16 flex-shrink-0 rounded-2xl bg-[var(--bg-secondary)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-3/4 rounded-full bg-[var(--bg-secondary)]" />
                    <div className="h-2.5 w-1/3 rounded-full bg-[var(--bg-secondary)]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-4 h-4 w-32 rounded-full bg-[var(--bg-secondary)]" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 flex-shrink-0 rounded-2xl bg-[var(--bg-secondary)]" />
                    <div className="h-3 w-20 rounded-full bg-[var(--bg-secondary)]" />
                  </div>
                  <div className="h-7 w-14 rounded-xl bg-[var(--bg-secondary)]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function EndOfFeedNotice() {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.06)]">
        <PartyPopper size={20} style={{ color: 'var(--accent)' }} />
      </div>
      <p className="gk-caption">Hai visto tutto!</p>
    </div>
  )
}

export function MobileCreatePostFab({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="md:hidden"
      style={{
        position: 'sticky',
        bottom: `calc(56px + env(safe-area-inset-bottom, 0px) + 16px)`,
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingRight: '1rem',
        pointerEvents: 'none',
        zIndex: 90,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label="Crea nuovo post"
        data-no-swipe="true"
        className="flex h-14 w-14 items-center justify-center rounded-2xl active:scale-95 transition-transform shadow-xl ring-1 ring-black/20"
        style={{ pointerEvents: 'auto', background: 'var(--accent)', boxShadow: '0 0 24px rgba(230,255,61,0.32)' }}
      >
        <Plus size={26} className="text-black" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  )
}
