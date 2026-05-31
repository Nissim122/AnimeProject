import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAnimeSequels, getAllSeasons, batchGetAnimeStatus } from '@/lib/anilist'

// ─── Helpers ───────────────────────────────────

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data }
}

function makeEdge(id: number, format: string, relationType: string, status = 'FINISHED') {
  return {
    relationType,
    node: {
      id,
      format,
      title: { romaji: `Title ${id}` },
      status,
      startDate: { year: 2020, month: null, day: null },
    },
  }
}

function makeSeasonMedia(
  id: number,
  seasonYear: number | null,
  season: string | null,
  format = 'TV',
  relations: unknown[] = []
) {
  return {
    id,
    title: { romaji: `Title ${id}`, english: null },
    coverImage: { large: '' },
    status: 'FINISHED',
    seasonYear,
    season,
    format,
    popularity: 100,
    episodes: 12,
    startDate: { year: seasonYear, month: null, day: null },
    nextAiringEpisode: null,
    relations: { edges: relations },
  }
}

// ─── Tests ─────────────────────────────────────

describe('getAnimeSequels', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns only SEQUEL edges with TV or TV_SHORT format', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Media: {
            relations: {
              edges: [
                makeEdge(1, 'TV', 'SEQUEL'),
                makeEdge(2, 'TV_SHORT', 'SEQUEL'),
                makeEdge(3, 'MOVIE', 'SEQUEL'),
                makeEdge(4, 'OVA', 'SEQUEL'),
                makeEdge(5, 'TV', 'PREQUEL'),
                makeEdge(6, 'TV', 'SIDE_STORY'),
              ],
            },
          },
        },
      })
    )
    const result = await getAnimeSequels(100)
    expect(result.map((r) => r.id)).toEqual([1, 2])
  })

  it('includes MOVIE sequels when includeMovies is true', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Media: {
            relations: {
              edges: [
                makeEdge(1, 'TV', 'SEQUEL'),
                makeEdge(2, 'MOVIE', 'SEQUEL'),
                makeEdge(3, 'OVA', 'SEQUEL'),
              ],
            },
          },
        },
      })
    )
    const result = await getAnimeSequels(100, { includeMovies: true })
    expect(result.map((r) => r.id)).toEqual([1, 2])
    expect(result.map((r) => r.id)).not.toContain(3) // OVA still excluded
  })

  it('returns empty array when there are no sequel edges', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: { Media: { relations: { edges: [] } } },
      })
    )
    const result = await getAnimeSequels(100)
    expect(result).toEqual([])
  })

  it('retries on HTTP 429 and succeeds on next attempt', async () => {
    vi.useFakeTimers()
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValue(okResponse({ data: { Media: { relations: { edges: [makeEdge(1, 'TV', 'SEQUEL')] } } } }))

    const promise = getAnimeSequels(100)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(1)
  })

  it('retries on GQL-level 429 (HTTP 200 with error body)', async () => {
    vi.useFakeTimers()
    mockFetch
      .mockResolvedValueOnce(
        okResponse({ data: null, errors: [{ message: 'Too Many Requests', status: 429 }] })
      )
      .mockResolvedValue(okResponse({ data: { Media: { relations: { edges: [] } } } }))

    const promise = getAnimeSequels(100)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual([])
  })

  it('throws after exhausting all 429 retries (4 total attempts)', async () => {
    vi.useFakeTimers()
    mockFetch.mockResolvedValue({ ok: false, status: 429 })

    // Attach the rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(getAnimeSequels(100)).rejects.toThrow('rate limit exceeded after retries')
    await vi.runAllTimersAsync()
    await assertion
    expect(mockFetch).toHaveBeenCalledTimes(4) // attempts 0, 1, 2, 3
  })

  it('throws on non-429 HTTP errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Server error' })
    await expect(getAnimeSequels(100)).rejects.toThrow('AniList API error 500')
  })
})

describe('batchGetAnimeStatus', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an empty Map without fetching when ids is empty', async () => {
    const result = await batchGetAnimeStatus([])
    expect(result.size).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('maps each id to its status and sequels', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Page: {
            media: [
              {
                id: 1,
                status: 'FINISHED',
                startDate: { year: 2020, month: 4, day: null },
                relations: {
                  edges: [makeEdge(2, 'TV', 'SEQUEL')],
                },
              },
              {
                id: 2,
                status: 'RELEASING',
                startDate: { year: 2021, month: 1, day: null },
                relations: { edges: [] },
              },
            ],
          },
        },
      })
    )
    const result = await batchGetAnimeStatus([1, 2])
    expect(result.get(1)?.status).toBe('FINISHED')
    expect(result.get(1)?.sequels).toHaveLength(1)
    expect(result.get(2)?.status).toBe('RELEASING')
    expect(result.get(2)?.sequels).toHaveLength(0)
  })

  it('filters sequels correctly in batch response', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Page: {
            media: [
              {
                id: 10,
                status: 'FINISHED',
                startDate: { year: 2020, month: null, day: null },
                relations: {
                  edges: [
                    makeEdge(11, 'TV', 'SEQUEL'),
                    makeEdge(12, 'MOVIE', 'SEQUEL'),
                    makeEdge(13, 'TV', 'PREQUEL'),
                  ],
                },
              },
            ],
          },
        },
      })
    )
    const result = await batchGetAnimeStatus([10])
    expect(result.get(10)?.sequels.map((s) => s.id)).toEqual([11]) // MOVIE excluded, PREQUEL excluded
  })

  it('includes movies when includeMovies is true', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Page: {
            media: [
              {
                id: 10,
                status: 'FINISHED',
                startDate: { year: 2020, month: null, day: null },
                relations: { edges: [makeEdge(11, 'MOVIE', 'SEQUEL')] },
              },
            ],
          },
        },
      })
    )
    const result = await batchGetAnimeStatus([10], { includeMovies: true })
    expect(result.get(10)?.sequels.map((s) => s.id)).toContain(11)
  })
})

describe('getAllSeasons', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sorts seasons by year', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Page: {
            media: [
              makeSeasonMedia(3, 2023, 'SPRING'),
              makeSeasonMedia(1, 2021, 'FALL'),
              makeSeasonMedia(2, 2022, 'WINTER'),
            ],
          },
        },
      })
    )
    const result = await getAllSeasons(1)
    expect(result.map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('sorts within same year by season order (WINTER < SPRING < SUMMER < FALL)', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Page: {
            media: [
              makeSeasonMedia(4, 2022, 'FALL'),
              makeSeasonMedia(1, 2022, 'WINTER'),
              makeSeasonMedia(3, 2022, 'SUMMER'),
              makeSeasonMedia(2, 2022, 'SPRING'),
            ],
          },
        },
      })
    )
    const result = await getAllSeasons(1)
    expect(result.map((r) => r.id)).toEqual([1, 2, 3, 4])
  })

  it('breaks season ties by id', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Page: {
            media: [
              makeSeasonMedia(20, 2022, 'SPRING'),
              makeSeasonMedia(10, 2022, 'SPRING'),
            ],
          },
        },
      })
    )
    const result = await getAllSeasons(10)
    expect(result.map((r) => r.id)).toEqual([10, 20])
  })

  it('excludes non-TV/non-ONA formats like OVA', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        data: {
          Page: {
            media: [
              makeSeasonMedia(1, 2021, 'SPRING', 'TV'),
              makeSeasonMedia(2, 2021, 'SPRING', 'OVA'),
              makeSeasonMedia(3, 2021, 'SPRING', 'MOVIE'),
            ],
          },
        },
      })
    )
    const result = await getAllSeasons(1)
    const ids = result.map((r) => r.id)
    expect(ids).toContain(1)    // TV included
    expect(ids).toContain(3)    // MOVIE included
    expect(ids).not.toContain(2) // OVA excluded
  })

  it('follows PREQUEL and SEQUEL relations to collect the full chain', async () => {
    // First batch: id=2 with a sequel edge to id=3
    mockFetch
      .mockResolvedValueOnce(
        okResponse({
          data: {
            Page: {
              media: [
                {
                  ...makeSeasonMedia(2, 2022, 'SPRING'),
                  relations: {
                    edges: [{ relationType: 'SEQUEL', node: { id: 3, format: 'TV' } }],
                  },
                },
              ],
            },
          },
        })
      )
      // Second batch: id=3 with no further relations
      .mockResolvedValue(
        okResponse({
          data: {
            Page: {
              media: [makeSeasonMedia(3, 2023, 'WINTER')],
            },
          },
        })
      )
    const result = await getAllSeasons(2)
    expect(result.map((r) => r.id)).toContain(2)
    expect(result.map((r) => r.id)).toContain(3)
  })
})
