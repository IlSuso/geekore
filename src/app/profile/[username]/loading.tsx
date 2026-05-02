// src/app/profile/[username]/loading.tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pt-8 pb-20 max-w-screen-2xl mx-auto px-4 md:px-6">
      {/* Header profilo */}
      <div className="flex flex-col items-center mb-10 animate-pulse">
        <div className="w-28 h-28 bg-zinc-800 rounded-full mb-4" />
        <div className="h-7 w-40 bg-zinc-800 rounded-full mb-2" />
        <div className="h-4 w-28 bg-zinc-800 rounded-full mb-4" />
        <div className="flex gap-6">
          {[1,2,3].map(i => (
            <div key={i} className="text-center">
              <div className="h-6 w-8 bg-zinc-800 rounded-full mx-auto mb-1" />
              <div className="h-3 w-14 bg-zinc-800 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex gap-2 mb-8 animate-pulse">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-9 w-24 bg-zinc-900 rounded-2xl" />
        ))}
      </div>
      {/* Grid media */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden animate-pulse">
            <div className="aspect-[2/3] bg-zinc-900" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-zinc-800 rounded-full" />
              <div className="h-2 bg-zinc-800 rounded-full w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}