import { SkeletonForYouRow, SkeletonFriendsWatching } from '@/components/ui/SkeletonCard'

export default function ForYouLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white">
      <div className="pt-2 md:pt-8 pb-24 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">
        {/* Utility bar */}
        <div className="flex justify-end items-center gap-2 mb-4">
          <div className="h-8 w-24 bg-zinc-900 rounded-xl animate-pulse" />
          <div className="h-8 w-8 bg-zinc-900 rounded-xl animate-pulse" />
        </div>
        {/* Search bar "Trova simili a…" */}
        <div className="h-9 w-full bg-zinc-900 rounded-2xl mb-6 animate-pulse" />
        {/* Amici che guardano */}
        <SkeletonFriendsWatching />
        {/* Sezioni consigliate — Simili non è mai presente al caricamento */}
        <SkeletonForYouRow />
        <SkeletonForYouRow />
      </div>
    </div>
  )
}
