'use client'
// src/components/ui/SkeletonCard.tsx
// Skeleton loaders riutilizzabili per tutti i loading states.
// Usali al posto degli spinner per una UX percepita più veloce.

// ── Media card skeleton (usato in profilo, for-you, discover) ─────────────────
export function SkeletonMediaCard() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden h-[520px] flex flex-col animate-pulse">
      {/* Cover */}
      <div className="h-60 skeleton flex-shrink-0" />
      {/* Content */}
      <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-3">
        <div className="h-4 skeleton rounded-full w-4/5" />
        <div className="h-3 skeleton rounded-full w-2/5" />
        <div className="flex gap-1 mt-1">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="w-4 h-4 skeleton rounded-sm" />
          ))}
        </div>
        <div className="mt-auto space-y-2">
          <div className="h-3 skeleton rounded-full w-1/2" />
          <div className="h-2 skeleton rounded-full" />
          <div className="h-2 skeleton rounded-full w-3/4" />
        </div>
      </div>
    </div>
  )
}

// ── Grid di skeleton card ────────────────────────────────────────────────────
export function SkeletonMediaGrid({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMediaCard key={i} />
      ))}
    </div>
  )
}

// ── Post del feed skeleton ────────────────────────────────────────────────────
export function SkeletonFeedPost() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 skeleton rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 skeleton rounded-full w-32" />
          <div className="h-3 skeleton rounded-full w-24" />
        </div>
      </div>
      <div className="space-y-2 mb-6">
        <div className="h-4 skeleton rounded-full" />
        <div className="h-4 skeleton rounded-full w-4/5" />
        <div className="h-4 skeleton rounded-full w-3/5" />
      </div>
      <div className="h-px skeleton mb-6" />
      <div className="flex gap-8">
        <div className="h-6 skeleton rounded-full w-16" />
        <div className="h-6 skeleton rounded-full w-16" />
      </div>
    </div>
  )
}

// ── Profilo skeleton ─────────────────────────────────────────────────────────
export function SkeletonProfile() {
  return (
    <div className="animate-pulse">
      <div className="flex flex-col items-center mb-12">
        <div className="w-36 h-36 skeleton rounded-full mb-6" />
        <div className="h-8 skeleton rounded-full w-48 mb-3" />
        <div className="h-5 skeleton rounded-full w-32 mb-4" />
        <div className="h-4 skeleton rounded-full w-64 mb-4" />
        <div className="flex gap-8 mt-4">
          <div className="text-center">
            <div className="h-6 skeleton rounded-full w-8 mx-auto mb-1" />
            <div className="h-3 skeleton rounded-full w-16" />
          </div>
          <div className="text-center">
            <div className="h-6 skeleton rounded-full w-8 mx-auto mb-1" />
            <div className="h-3 skeleton rounded-full w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Notification skeleton ─────────────────────────────────────────────────────
export function SkeletonNotification() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-zinc-800 animate-pulse">
      <div className="w-11 h-11 skeleton rounded-2xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 skeleton rounded-full w-3/4" />
        <div className="h-3 skeleton rounded-full w-1/3" />
      </div>
    </div>
  )
}

// ── News card skeleton ────────────────────────────────────────────────────────
export function SkeletonNewsCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-[2/3] skeleton" />
      <div className="p-3 space-y-2">
        <div className="h-3 skeleton rounded-full" />
        <div className="h-3 skeleton rounded-full w-4/5" />
        <div className="h-2 skeleton rounded-full w-1/2 mt-2" />
      </div>
    </div>
  )
}

// ── Discover result skeleton ──────────────────────────────────────────────────
export function SkeletonDiscoverCard() {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden animate-pulse">
      <div className="h-64 skeleton" />
      <div className="p-4 space-y-3">
        <div className="h-4 skeleton rounded-full w-4/5" />
        <div className="h-3 skeleton rounded-full w-1/3" />
        <div className="h-10 skeleton rounded-2xl" />
      </div>
    </div>
  )
}