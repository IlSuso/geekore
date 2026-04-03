import { Search as SearchIcon } from 'lucide-react'

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-6">
      <div className="max-w-xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
            Ricerca_Player
          </h1>
          <p className="text-[10px] text-[#7c6af7] font-bold uppercase tracking-[0.3em] mt-1">Trova nuovi alleati</p>
        </div>
        
        <div className="relative group">
          <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-[#7c6af7] transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Cerca username o contenuti..." 
            className="w-full bg-[#16161e] border border-white/5 rounded-[2.5rem] py-6 pl-14 pr-6 text-white outline-none focus:ring-1 focus:ring-[#7c6af7] transition-all font-bold placeholder:text-gray-700 shadow-2xl"
          />
        </div>

        {/* Griglia Suggerimenti (Vuota per ora) */}
        <div className="mt-20 text-center">
          <div className="inline-block p-10 rounded-[3rem] border-2 border-dashed border-white/5 opacity-20">
            <SearchIcon size={40} className="mx-auto mb-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.5em]">In attesa di input...</p>
          </div>
        </div>
      </div>
    </main>
  )
}