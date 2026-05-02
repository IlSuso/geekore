'use client'

import { PartyPopper, Plus } from 'lucide-react'
import { SkeletonFeedPost } from '@/components/ui/SkeletonCard'

export function FeedLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="pt-0 pb-24 xl:pb-6 relative min-h-screen">
        <div className="lg:pl-[360px] flex items-start min-h-screen">
          <div className="flex-1 min-w-0">
            <div className="max-w-[680px] mx-auto px-4">
              <div className="my-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-zinc-800 flex-shrink-0" />
                <div className="h-3.5 bg-zinc-800 rounded-full w-48" />
              </div>

              <div className="flex items-stretch mb-0 mt-1">
                <div className="flex-1 py-3 flex justify-center">
                  <div className="h-3.5 w-10 bg-zinc-800 rounded-full animate-pulse" />
                </div>
                <div className="flex-1 py-3 flex justify-center">
                  <div className="h-3.5 w-20 bg-zinc-800 rounded-full animate-pulse" />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-3">
                {Array.from({ length: 4 }).map((_, i) => <SkeletonFeedPost key={i} />)}
              </div>
            </div>
          </div>

          <div className="hidden xl:block w-[420px] flex-shrink-0 sticky top-12 pt-4 px-4 space-y-6 animate-pulse">
            <div>
              <div className="h-4 w-40 bg-zinc-800 rounded-full mb-4" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="w-16 h-[88px] bg-zinc-800 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-zinc-800 rounded-full w-3/4" />
                    <div className="h-2.5 bg-zinc-800 rounded-full w-1/3" />
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="h-4 w-32 bg-zinc-800 rounded-full mb-4" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-zinc-800 rounded-full flex-shrink-0" />
                    <div className="h-3 bg-zinc-800 rounded-full w-20" />
                  </div>
                  <div className="w-14 h-7 bg-zinc-800 rounded-xl" />
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
    <div className="text-center py-10 flex flex-col items-center gap-2">
      <div className="w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center">
        <PartyPopper size={20} style={{ color: '#E6FF3D' }} />
      </div>
      <p className="text-[13px] text-[var(--text-muted)]">Hai visto tutto!</p>
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
        onClick={onClick}
        aria-label="Crea nuovo post"
        className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform shadow-xl"
        style={{ pointerEvents: 'auto', background: '#E6FF3D', boxShadow: '0 0 20px rgba(230,255,61,0.35)' }}
      >
        <Plus size={26} className="text-black" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  )
}
