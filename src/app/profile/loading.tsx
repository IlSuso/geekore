export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-950 pt-8 pb-20 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">
      <div className="flex flex-col items-center mb-12">
        <div className="w-36 h-36 rounded-full bg-zinc-800 animate-pulse mb-6" />
        <div className="h-10 w-48 bg-zinc-800 rounded animate-pulse mb-3" />
        <div className="h-5 w-32 bg-zinc-800 rounded animate-pulse" />
      </div>
      <div className="h-8 w-48 bg-zinc-800 rounded animate-pulse mb-10" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-[520px] bg-zinc-900 rounded-3xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}