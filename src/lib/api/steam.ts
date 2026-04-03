const STEAM_API_BASE = 'https://api.steampowered.com'

export async function getSteamOwnedGames(steamId: string) {
  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()
  return data?.response?.games ?? []
}

export async function getSteamRecentGames(steamId: string) {
  const url = `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&count=10`
  const res = await fetch(url, { next: { revalidate: 1800 } })
  const data = await res.json()
  return data?.response?.games ?? []
}

export async function getSteamAchievements(steamId: string, appId: string) {
  const url = `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&appid=${appId}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()
  return data?.playerstats ?? null
}

export function steamCoverUrl(appId: number): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
}

export function steamHoursPlayed(minutesPlayed: number): string {
  const hours = Math.floor(minutesPlayed / 60)
  return `${hours}h`
}
