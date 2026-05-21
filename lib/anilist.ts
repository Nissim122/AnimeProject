const ANILIST_URL = 'https://graphql.anilist.co'

export interface AnimeResult {
  id: number
  title: { romaji: string; english: string | null }
  coverImage: { medium: string }
  status: string
  seasonYear: number | null
  season: string | null
  format: string | null
}

export interface RelationNode {
  id: number
  format: string | null
  title: { romaji: string }
  status: string
  startDate: { year: number | null; month: number | null; day: number | null }
}

async function gqlFetch(query: string, variables: Record<string, unknown>) {
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AniList API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function searchAnime(search: string): Promise<AnimeResult[]> {
  const query = `
    query SearchAnime($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: ANIME, format_in: [TV, TV_SHORT]) {
          id
          title { romaji english }
          coverImage { medium }
          status
          seasonYear
          season
          format
        }
      }
    }
  `
  const data = await gqlFetch(query, { search })
  return data?.data?.Page?.media ?? []
}

export async function getAnimeSequels(anilistId: number): Promise<RelationNode[]> {
  const query = `
    query GetRelations($id: Int) {
      Media(id: $id, type: ANIME) {
        relations {
          edges {
            relationType
            node {
              id
              format
              title { romaji }
              status
              startDate { year month day }
            }
          }
        }
      }
    }
  `
  const data = await gqlFetch(query, { id: anilistId })
  const edges: Array<{ relationType: string; node: RelationNode }> =
    data?.data?.Media?.relations?.edges ?? []

  return edges
    .filter(
      (e) =>
        e.relationType === 'SEQUEL' &&
        (e.node.format === 'TV' || e.node.format === 'TV_SHORT')
    )
    .map((e) => e.node)
}

export async function getAllSeasons(anilistId: number): Promise<AnimeResult[]> {
  const visited = new Set<number>()
  const queue: number[] = [anilistId]
  const results: AnimeResult[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    if (visited.size >= 20) break
    visited.add(id)

    const data = await gqlFetch(
      `query GetSeason($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title { romaji english }
          coverImage { medium }
          status
          seasonYear
          season
          format
          relations {
            edges {
              relationType
              node { id format }
            }
          }
        }
      }`,
      { id }
    )

    const media = data?.data?.Media
    if (!media) continue

    results.push({
      id: media.id,
      title: media.title,
      coverImage: media.coverImage,
      status: media.status,
      seasonYear: media.seasonYear,
      season: media.season,
      format: media.format,
    })

    const edges: Array<{ relationType: string; node: { id: number; format: string | null } }> =
      media.relations?.edges ?? []

    for (const edge of edges) {
      if (
        (edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL') &&
        (edge.node.format === 'TV' || edge.node.format === 'TV_SHORT') &&
        !visited.has(edge.node.id)
      ) {
        queue.push(edge.node.id)
      }
    }
  }

  return results.sort(
    (a, b) => (a.seasonYear ?? 9999) - (b.seasonYear ?? 9999) || a.id - b.id
  )
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
