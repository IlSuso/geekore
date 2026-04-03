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
    board: '#fb923c',
  }
  return map[type]
}

export function mediaLabel(type: MediaType): string {
  const map: Record<MediaType, string> = {
    anime: 'Anime',
    manga: 'Manga',
    game: 'Videogioco',
    board: 'Board Game',
  }
  return map[type]
}

export function progressLabel(type: MediaType, progress: number): string {
  const map: Record<MediaType, string> = {
    anime: `Ep. ${progress}`,
    manga: `Cap. ${progress}`,
    game: `${progress}h`,
    board: `${progress} partite`,
  }
  return map[type]
}

export function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'ora'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m fa`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h fa`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}g fa`
  return new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
