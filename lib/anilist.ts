const ANILIST_URL = 'https://graphql.anilist.co'
let _lastGqlCall = 0
const GQL_MIN_INTERVAL = 1000

export interface AnimeResult {
  id: number
  title: { romaji: string; english: string | null }
  coverImage: { large: string }
  status: string
  seasonYear: number | null
  season: string | null
  format: string | null
  popularity: number | null
  episodes: number | null
  nextAiringEpisode: { episode: number; airingAt: number } | null
}

export interface RelationNode {
  id: number
  format: string | null
  title: { romaji: string }
  status: string
  startDate: { year: number | null; month: number | null; day: number | null }
}

async function gqlFetch(query: string, variables: Record<string, unknown>, attempt = 0): Promise<unknown> {
  const wait = _lastGqlCall + GQL_MIN_INTERVAL - Date.now()
  if (wait > 0) await delay(wait)
  _lastGqlCall = Date.now()

  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 429) {
    if (attempt < 3) {
      console.warn(`[AniList] rate limited (HTTP 429), retry ${attempt + 1}…`)
      await delay(5000 * (attempt + 1))
      return gqlFetch(query, variables, attempt + 1)
    }
    throw new Error('AniList rate limit exceeded after retries')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`AniList API error ${res.status}: ${text}`)
  }

  const data = await res.json() as { data: unknown; errors?: Array<{ message: string; status?: number }> }

  // AniList sometimes returns HTTP 200 with errors (e.g., rate limiting)
  if (data.errors?.length && data.data == null) {
    const err = data.errors[0]
    if ((err.status === 429 || err.message.includes('Too Many')) && attempt < 3) {
      console.warn(`[AniList] rate limited (GQL 429), retry ${attempt + 1}…`)
      await delay(5000 * (attempt + 1))
      return gqlFetch(query, variables, attempt + 1)
    }
    throw new Error(`AniList error: ${err.message}`)
  }

  return data
}

export async function searchAnime(search: string): Promise<AnimeResult[]> {
  const query = `
    query SearchAnime($search: String) {
      Page(perPage: 10) {
        media(search: $search, type: ANIME, format_in: [TV, TV_SHORT]) {
          id
          title { romaji english }
          coverImage { large }
          status
          seasonYear
          season
          format
          popularity
          relations {
            edges {
              relationType
              node { id }
            }
          }
        }
      }
    }
  `
  const data = await gqlFetch(query, { search }) as any
  return data?.data?.Page?.media ?? []
}

export async function getAnimeSequels(
  anilistId: number,
  { includeMovies = false }: { includeMovies?: boolean } = {}
): Promise<RelationNode[]> {
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
  const data = await gqlFetch(query, { id: anilistId }) as any
  const edges: Array<{ relationType: string; node: RelationNode }> =
    data?.data?.Media?.relations?.edges ?? []

  return edges
    .filter(
      (e) =>
        e.relationType === 'SEQUEL' &&
        (e.node.format === 'TV' || e.node.format === 'TV_SHORT' || (includeMovies && e.node.format === 'MOVIE'))
    )
    .map((e) => e.node)
}

export async function getAnimeStatusWithSequels(
  anilistId: number,
  { includeMovies = false }: { includeMovies?: boolean } = {}
): Promise<{
  status: string
  startDate: { year: number | null; month: number | null; day: number | null }
  sequels: RelationNode[]
}> {
  const query = `
    query GetMedia($id: Int) {
      Media(id: $id, type: ANIME) {
        status
        startDate { year month day }
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
  const data = await gqlFetch(query, { id: anilistId }) as any
  const media = data?.data?.Media
  if (!media) return { status: 'UNKNOWN', startDate: { year: null, month: null, day: null }, sequels: [] }

  const edges: Array<{ relationType: string; node: RelationNode }> =
    media.relations?.edges ?? []

  const sequels = edges
    .filter(
      (e) =>
        e.relationType === 'SEQUEL' &&
        (e.node.format === 'TV' || e.node.format === 'TV_SHORT' || (includeMovies && e.node.format === 'MOVIE'))
    )
    .map((e) => e.node)

  return { status: media.status, startDate: media.startDate, sequels }
}

// Internal: fetch a batch of media nodes in one request (used by getAllSeasons BFS)
async function batchFetchNodes(ids: number[]): Promise<Array<{
  id: number
  title: { romaji: string; english: string | null }
  coverImage: { large: string }
  status: string
  seasonYear: number | null
  season: string | null
  format: string | null
  popularity: number | null
  episodes: number | null
  nextAiringEpisode: { episode: number; airingAt: number } | null
  relations: { edges: Array<{ relationType: string; node: { id: number; format: string | null } }> }
}>> {
  if (ids.length === 0) return []
  const data = await gqlFetch(
    `query BatchNodes($ids: [Int]) {
      Page(perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          id
          title { romaji english }
          coverImage { large }
          status
          seasonYear
          season
          format
          popularity
          episodes
          nextAiringEpisode {
            episode
            airingAt
          }
          relations {
            edges {
              relationType
              node { id format }
            }
          }
        }
      }
    }`,
    { ids }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.data?.Page?.media ?? []
}

export async function getAllSeasons(anilistId: number): Promise<AnimeResult[]> {
  const visited = new Set<number>()
  let queue: number[] = [anilistId]
  const results: AnimeResult[] = []

  while (queue.length > 0 && visited.size < 20) {
    // Fetch the entire current frontier in one batch request
    const batch = queue.splice(0, Math.min(queue.length, 20 - visited.size))
    const toFetch = batch.filter((id) => !visited.has(id))
    if (toFetch.length === 0) continue
    toFetch.forEach((id) => visited.add(id))

    let mediaList: Awaited<ReturnType<typeof batchFetchNodes>>
    try {
      mediaList = await batchFetchNodes(toFetch)
    } catch (err) {
      console.error(`[getAllSeasons] batch fetch failed for ids ${toFetch}:`, err)
      continue
    }

    for (const media of mediaList) {
      if (media.format === 'TV' || media.format === 'TV_SHORT' || media.format === 'MOVIE') {
        results.push({
          id: media.id,
          title: media.title,
          coverImage: media.coverImage,
          status: media.status,
          seasonYear: media.seasonYear,
          season: media.season,
          format: media.format,
          popularity: media.popularity,
          episodes: media.episodes,
          nextAiringEpisode: media.nextAiringEpisode ?? null,
        })
      }

      for (const edge of media.relations.edges) {
        const fmt = edge.node.format
        if (
          (edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL') &&
          (fmt === null || fmt === 'TV' || fmt === 'TV_SHORT' || fmt === 'MOVIE') &&
          !visited.has(edge.node.id)
        ) {
          queue.push(edge.node.id)
        }
      }
    }
  }

  const SEASON_ORDER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
  return results.sort((a, b) => {
    const yearDiff = (a.seasonYear ?? 9999) - (b.seasonYear ?? 9999)
    if (yearDiff !== 0) return yearDiff
    const seasonDiff = (SEASON_ORDER[a.season ?? ''] ?? 4) - (SEASON_ORDER[b.season ?? ''] ?? 4)
    if (seasonDiff !== 0) return seasonDiff
    return a.id - b.id
  })
}

// Batch fetch status + direct sequels for multiple IDs in one request
export async function batchGetAnimeStatus(
  ids: number[],
  { includeMovies = false }: { includeMovies?: boolean } = {}
): Promise<Map<number, {
  status: string
  startDate: { year: number | null; month: number | null; day: number | null }
  sequels: RelationNode[]
}>> {
  if (ids.length === 0) return new Map()
  const data = await gqlFetch(
    `query BatchStatus($ids: [Int]) {
      Page(perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          id
          status
          startDate { year month day }
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
    }`,
    { ids }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mediaList: any[] = (data as any)?.data?.Page?.media ?? []
  const result = new Map<number, { status: string; startDate: { year: number | null; month: number | null; day: number | null }; sequels: RelationNode[] }>()
  for (const media of mediaList) {
    const edges: Array<{ relationType: string; node: RelationNode }> = media.relations?.edges ?? []
    const sequels = edges
      .filter((e) =>
        e.relationType === 'SEQUEL' &&
        (e.node.format === 'TV' || e.node.format === 'TV_SHORT' || (includeMovies && e.node.format === 'MOVIE'))
      )
      .map((e) => e.node)
    result.set(media.id, { status: media.status, startDate: media.startDate, sequels })
  }
  return result
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
