'use client'

import { UserProfile } from '@/types'
import { Avatar } from '@/components/ui/Avatar'

interface StoriesBarProps {
  friends: UserProfile[]
}

export function StoriesBar({ friends }: StoriesBarProps) {
  return (
    <div className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-none">
      {/* My story */}
      <button className="flex flex-col items-center gap-1.5 shrink-0">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-2 border-dashed border-accent/40 flex items-center justify-center bg-accent/10">
            <span className="text-accent text-2xl leading-none">+</span>
          </div>
        </div>
        <span className="text-[10px] text-white/40 w-14 text-center truncate">Tu</span>
      </button>

      {friends.map((friend) => (
        <button key={friend.id} className="flex flex-col items-center gap-1.5 shrink-0">
          <div className="relative">
            {/* Gradient ring */}
            <div className="h-14 w-14 rounded-full p-[2px]"
              style={{ background: 'linear-gradient(135deg, #7c6af7, #38bdf8, #f97066)' }}>
              <div className="h-full w-full rounded-full bg-bg p-[2px]">
                <Avatar
                  src={friend.avatar_url}
                  username={friend.username}
                  size={48}
                  className="rounded-full"
                />
              </div>
            </div>
            {/* Online dot */}
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-game border-2 border-bg" />
          </div>
          <span className="text-[10px] text-white/50 w-14 text-center truncate">
            {friend.display_name}
          </span>
        </button>
      ))}
    </div>
  )
}
