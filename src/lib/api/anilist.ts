const ANILIST_API = 'https://graphql.anilist.co'

export async function searchAniList(query: string, type: 'ANIME' | 'MANGA' = 'ANIME') {
  const gql = `
    query ($search: String, $type: MediaType) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: $type, sort: SEARCH_MATCH) {
          id
          title { romaji english native }
          coverImage { large medium }
          episodes
          chapters
          volumes
          genres
          startDate { year }
          status
        }
      }
    }
  `
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query, type } }),
    next: { revalidate: 3600 },
  })
  const data = await res.json()
  return data?.data?.Page?.media ?? []
}

export async function getAniListMedia(id: number, type: 'ANIME' | 'MANGA' = 'ANIME') {
  const gql = `
    query ($id: Int, $type: MediaType) {
      Media(id: $id, type: $type) {
        id
        title { romaji english native }
        coverImage { large extraLarge }
        bannerImage
        description(asHtml: false)
        episodes
        chapters
        volumes
        genres
        startDate { year month day }
        status
        averageScore
        nextAiringEpisode { airingAt episode }
      }
    }
  `
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { id, type } }),
    next: { revalidate: 3600 },
  })
  const data = await res.json()
  return data?.data?.Media ?? null
}
