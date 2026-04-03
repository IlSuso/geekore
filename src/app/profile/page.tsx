export default function Profile() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-4">
      <div className="max-w-xl mx-auto">
        {/* Profile Header */}
        <div className="text-center mb-8">
          <div className="relative inline-block">
            <div className="w-28 h-28 rounded-[2.5rem] bg-gradient-to-tr from-[#7c6af7] to-[#b06ab3] p-1 mx-auto">
              <div className="w-full h-full rounded-[2.3rem] bg-[#0a0a0f] p-1">
                 <div className="w-full h-full rounded-[2rem] bg-gray-800" />
              </div>
            </div>
            <div className="absolute -bottom-2 -right-2 bg-[#7c6af7] text-white text-[10px] font-black px-3 py-1 rounded-full border-4 border-[#0a0a0f]">
              LVL 42
            </div>
          </div>
          <h2 className="mt-4 text-xl font-black text-white uppercase tracking-tight">IlSuso</h2>
          <p className="text-gray-500 text-xs font-medium uppercase tracking-widest mt-1">Pro Player & Creator</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10 bg-[#16161e]/50 border border-white/5 rounded-[2rem] p-6 text-center">
          <div><div className="text-white font-black text-lg">1.2k</div><div className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Follower</div></div>
          <div className="border-x border-white/5"><div className="text-white font-black text-lg">450</div><div className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Following</div></div>
          <div><div className="text-white font-black text-lg">8.4k</div><div className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Rep</div></div>
        </div>

        {/* Grid Post */}
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-square bg-[#16161e] rounded-2xl border border-white/5 overflow-hidden group relative">
               <div className="absolute inset-0 bg-[#7c6af7]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}