"use client"
import { useState } from 'react'
import { Image as ImageIcon, X, Send, Zap } from 'lucide-react'

export default function Dashboard() {
  const [content, setContent] = useState('')
  const [image, setImage] = useState<string | null>(null)

  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-24 pb-32 px-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Zap className="text-[#7c6af7]" fill="#7c6af7" size={24} />
          <h1 className="text-2xl font-black uppercase tracking-tighter text-white">Nuovo Drop</h1>
        </div>

        <div className="bg-[#16161e] border border-white/5 rounded-[2.5rem] p-6 shadow-2xl">
          <textarea 
            placeholder="Cosa bolle in pentola, Legend?"
            className="w-full bg-transparent border-none text-white placeholder:text-gray-600 resize-none focus:ring-0 text-lg min-h-[150px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          {image && (
            <div className="relative mt-4 rounded-2xl overflow-hidden border border-white/10">
              <img src={image} className="w-full h-48 object-cover" alt="Preview" />
              <button 
                onClick={() => setImage(null)}
                className="absolute top-2 right-2 p-1 bg-black/50 backdrop-blur-md rounded-full text-white"
              >
                <X size={16} />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
            <button className="flex items-center gap-2 text-[#7c6af7] font-bold text-sm bg-[#7c6af7]/10 px-4 py-2 rounded-full hover:bg-[#7c6af7]/20 transition-all">
              <ImageIcon size={20} />
              Media
            </button>
            
            <button 
              disabled={!content}
              className="bg-[#7c6af7] text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#7c6af7]/20"
            >
              Pubblica <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}