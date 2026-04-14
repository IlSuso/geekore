// src/app/wishlist/loading.tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-black pt-8 pb-20 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">
      <div className="mb-8 animate-pulse">
        <div className="h-10 w-40 bg-zinc-800 rounded-2xl mb-3" />
        <div className="h-4 w-52 bg-zinc-800 rounded-full" />
      </div>
      {/* Filtri */}
      <div className="flex gap-3 mb-8 animate-pulse">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-9 w-24 bg-zinc-900 rounded-2xl" />
        ))}
      </div>
      {/* Lista */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex gap-4 items-center animate-pulse">
            <div className="w-12 h-16 bg-zinc-900 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-800 rounded-full w-2/3" />
              <div className="h-3 bg-zinc-800 rounded-full w-1/4" />
            </div>
            <div className="w-20 h-8 bg-zinc-800 rounded-xl flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}