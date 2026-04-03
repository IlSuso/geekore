import Image from 'next/image'
import { cn } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  username: string
  size?: number
  className?: string
}

export function Avatar({ src, username, size = 36, className }: AvatarProps) {
  const initials = username.slice(0, 2).toUpperCase()

  if (src) {
    return (
      <Image
        src={src}
        alt={username}
        width={size}
        height={size}
        className={cn('rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={cn('flex items-center justify-center rounded-full bg-accent/20 text-accent font-semibold', className)}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  )
}
