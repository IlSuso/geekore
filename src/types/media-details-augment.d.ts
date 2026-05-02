import '@/components/media/MediaDetailsDrawer'

declare module '@/components/media/MediaDetailsDrawer' {
  interface MediaDetails {
    tags?: string[]
    keywords?: string[]
    categories?: string[]
    player_perspectives?: string[]
    game_modes?: string[]
    externalId?: string
  }
}
