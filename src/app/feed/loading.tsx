export default function Loading() {
  return (
    <div className="min-h-screen bg-black pt-8 pb-20 max-w-screen-2xl mx-auto px-6">
      <div className="mb-12 h-48 bg-zinc-950 border border-zinc-800 rounded-3xl animate-pulse" />
      <div className="space-y-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 animate-pulse">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-zinc-800 rounded-2xl" />
              <div className="space-y-2">
                <div className="h-4 w-32 bg-zinc-800 rounded" />
                <div className="h-3 w-24 bg-zinc-800 rounded" />
              </div>
            </div>
            <div className="space-y-2 mb-8">
              <div className="h-4 w-full bg-zinc-800 rounded" />
              <div className="h-4 w-3/4 bg-zinc-800 rounded" />
            </div>
            <div className="h-px bg-zinc-800 mb-6" />
            <div className="flex gap-10">
              <div className="h-6 w-16 bg-zinc-800 rounded" />
              <div className="h-6 w-16 bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}