import type { Dispatch, SetStateAction } from 'react'
import type { BottomSheetAction } from './PostComponents'

export type FeedSheetState =
  | { open: false }
  | { open: true; type: 'post'; postId: string }
  | { open: true; type: 'comment'; commentId: string; postId: string }
  | { open: true; type: 'confirm-post'; postId: string }
  | { open: true; type: 'confirm-comment'; commentId: string; postId: string }

export function getFeedSheetTitle(sheet: FeedSheetState): string | undefined {
  if (!sheet.open) return undefined
  if (sheet.type === 'confirm-post') return 'Eliminare il post? Questa azione è irreversibile.'
  if (sheet.type === 'confirm-comment') return 'Eliminare il commento?'
  return undefined
}

export function buildFeedSheetActions(
  sheet: FeedSheetState,
  handlers: {
    startEditPost: (postId: string) => void
    handleDeletePost: (postId: string) => void
    handleDeleteComment: (commentId: string, postId: string) => void
    closeSheet: () => void
    setSheet: Dispatch<SetStateAction<FeedSheetState>>
  }
): BottomSheetAction[] {
  const { startEditPost, handleDeletePost, handleDeleteComment, closeSheet, setSheet } = handlers

  if (!sheet.open) return []

  if (sheet.type === 'post') return [
    { label: 'Modifica post', onClick: () => startEditPost(sheet.postId) },
    { label: 'Elimina post', danger: true, onClick: () => setSheet({ open: true, type: 'confirm-post', postId: sheet.postId }) },
  ]

  if (sheet.type === 'comment') return [
    { label: 'Elimina commento', danger: true, onClick: () => setSheet({ open: true, type: 'confirm-comment', commentId: sheet.commentId, postId: sheet.postId }) },
  ]

  if (sheet.type === 'confirm-post') return [
    { label: 'Conferma eliminazione', danger: true, onClick: () => { handleDeletePost(sheet.postId); closeSheet() } },
  ]

  if (sheet.type === 'confirm-comment') return [
    { label: 'Conferma eliminazione', danger: true, onClick: () => { handleDeleteComment(sheet.commentId, sheet.postId); closeSheet() } },
  ]

  return []
}
