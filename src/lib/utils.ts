import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { MediaType } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function mediaColor(type: MediaType): string {
  const map: Record<MediaType, string> = {
    anime: '#38bdf8',
    manga: '#f97066',
    game: '#4ade80',
    tv: '#a78bfa',
    movie: '#f43f5e',
  }
  return map[type] ?? '#71717a'
}

export function mediaLabel(type: MediaType): string {
  const map: Record<MediaType, string> = {
    anime: 'Anime',
    manga: 'Manga',
    game: 'Videogioco',
    tv: 'Serie TV',
    movie: 'Film',
  }
  return map[type] ?? type
}

export function progressLabel(type: MediaType, progress: number): string {
  const map: Record<MediaType, string> = {
    anime: `Ep. ${progress}`,
    manga: `Cap. ${progress}`,
    game: `${progress}h`,
    tv: `Ep. ${progress}`,
    movie: progress > 0 ? 'Completato' : 'Non visto',
  }
  return map[type] ?? `${progress}`
}

export function truncateAtSentence(text: string, maxLen: number): string {
  if (!text || text.length <= maxLen) return text
  const sub = text.slice(0, maxLen)
  const last = Math.max(
    sub.lastIndexOf('. '), sub.lastIndexOf('! '), sub.lastIndexOf('? '),
    sub.lastIndexOf('.\n'), sub.lastIndexOf('!\n'), sub.lastIndexOf('?\n'),
    sub.lastIndexOf('."'), sub.lastIndexOf('!"'), sub.lastIndexOf('?"'),
  )
  if (last > maxLen * 0.4) return sub.slice(0, last + 1).trim()
  const lastSpace = sub.lastIndexOf(' ')
  return lastSpace > 0 ? sub.slice(0, lastSpace).trim() : sub
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'ora'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m fa`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h fa`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}g fa`
  return new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
