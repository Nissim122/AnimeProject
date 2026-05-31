import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const {
  mockBatchGetAnimeStatus,
  mockGetAnimeSequels,
  mockGetStatusCacheBatch,
  mockSetStatusCacheBatch,
  mockDeleteStatusCacheBatch,
  mockGetCachedAllSeasons,
  mockDeleteSeasonCacheBatch,
} = vi.hoisted(() => ({
  mockBatchGetAnimeStatus: vi.fn(),
  mockGetAnimeSequels: vi.fn(),
  mockGetStatusCacheBatch: vi.fn(),
  mockSetStatusCacheBatch: vi.fn().mockResolvedValue(undefined),
  mockDeleteStatusCacheBatch: vi.fn().mockResolvedValue(undefined),
  mockGetCachedAllSeasons: vi.fn(),
  mockDeleteSeasonCacheBatch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown) => ({ body })),
  },
}))

vi.mock('@/lib/anilist', () => ({
  batchGetAnimeStatus: mockBatchGetAnimeStatus,
  getAnimeSequels: mockGetAnimeSequels,
  withRateLimit: vi.fn().mockImplementation((fn: () => unknown) => fn()),
}))

vi.mock('@/lib/seasonCache', () => ({
  getCachedAllSeasons: mockGetCachedAllSeasons,
  deleteSeasonCacheBatch: mockDeleteSeasonCacheBatch,
}))

vi.mock('@/lib/statusCache', () => ({
  getStatusCacheBatch: mockGetStatusCacheBatch,
  setStatusCacheBatch: mockSetStatusCacheBatch,
  deleteStatusCacheBatch: mockDeleteStatusCacheBatch,
}))

// ─── Import after mocks ────────────────────────
import { GET } from '@/app/api/next-seasons/route'

// ─── Helpers ───────────────────────────────────
function makeReq(params: Record<string, string> = {}) {
  return {
    nextUrl: { searchParams: new URLSearchParams(params) },
  } as Parameters<typeof GET>[0]
}

function makeSequel(id: number, status: string, year: number | null = null) {
  return {
    id,
    format: 'TV' as const,
    title: { romaji: `Title ${id}` },
    status,
    startDate: { year, month: null, day: null },
  }
}

function statusEntry(
  status: string,
  sequels: ReturnType<typeof makeSequel>[] = [],
  year: number | null = null
) {
  return {
    status,
    startDate: { year, month: null, day: null },
    sequels,
  }
}

// ─── Tests ─────────────────────────────────────
describe('GET /api/next-seasons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: all cache misses, empty AniList responses
    mockGetStatusCacheBatch.mockResolvedValue(new Map())
    mockBatchGetAnimeStatus.mockResolvedValue(new Map())
    mockGetCachedAllSeasons.mockResolvedValue([])
    mockGetAnimeSequels.mockResolvedValue([])
  })

  it('returns empty object when ids param is missing', async () => {
    const res = (await GET(makeReq())) as { body: unknown }
    expect(res.body).toEqual({})
  })

  it('returns empty object when ids param is blank', async () => {
    const res = (await GET(makeReq({ ids: '' }))) as { body: unknown }
    expect(res.body).toEqual({})
  })

  it('uses cached status data when available', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(
      new Map([[1, statusEntry('FINISHED')]])
    )
    await GET(makeReq({ ids: '1' }))
    expect(mockBatchGetAnimeStatus).not.toHaveBeenCalled()
  })

  it('fetches from AniList for cache misses', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(new Map())
    mockBatchGetAnimeStatus.mockResolvedValue(new Map([[1, statusEntry('FINISHED')]]))
    await GET(makeReq({ ids: '1' }))
    expect(mockBatchGetAnimeStatus).toHaveBeenCalledWith([1], { includeMovies: true })
  })

  it('merges cached and fresh data', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(new Map([[1, statusEntry('FINISHED')]]))
    mockBatchGetAnimeStatus.mockResolvedValue(new Map([[2, statusEntry('RELEASING')]]))
    const res = (await GET(makeReq({ ids: '1,2' }))) as { body: Record<string, unknown> }
    expect(Object.keys(res.body)).toContain('1')
    expect(Object.keys(res.body)).toContain('2')
  })

  it('sets next to an upcoming direct sequel', async () => {
    const upcomingSequel = makeSequel(99, 'NOT_YET_RELEASED', 2025)
    mockGetStatusCacheBatch.mockResolvedValue(
      new Map([[1, statusEntry('FINISHED', [upcomingSequel])]])
    )
    const res = (await GET(makeReq({ ids: '1' }))) as {
      body: Record<string, { next: unknown; available: unknown }>
    }
    expect(res.body['1'].next).toMatchObject({ id: 99, status: 'NOT_YET_RELEASED' })
    expect(res.body['1'].available).toBeNull()
  })

  it('sets available to an untracked finished sequel', async () => {
    const finishedSequel = makeSequel(50, 'FINISHED', 2022)
    mockGetStatusCacheBatch.mockResolvedValue(
      new Map([[1, statusEntry('FINISHED', [finishedSequel])]])
    )
    const res = (await GET(makeReq({ ids: '1' }))) as {
      body: Record<string, { available: { id: number } | null }>
    }
    expect(res.body['1'].available?.id).toBe(50)
  })

  it('does NOT mark a sequel as available when it is already tracked', async () => {
    const finishedSequel = makeSequel(50, 'FINISHED', 2022)
    mockGetStatusCacheBatch.mockResolvedValue(
      new Map([[1, statusEntry('FINISHED', [finishedSequel])]])
    )
    // ids=1,50 → both tracked → 50 is in trackedSet
    const res = (await GET(makeReq({ ids: '1,50' }))) as {
      body: Record<string, { available: unknown }>
    }
    expect(res.body['1'].available).toBeNull()
  })

  it('sets hasReleasingAhead when available sequel has a releasing next-level sequel', async () => {
    const finishedSequel = makeSequel(50, 'FINISHED', 2022)
    mockGetStatusCacheBatch.mockResolvedValue(
      new Map([[1, statusEntry('FINISHED', [finishedSequel])]])
    )
    // Level-2 sequel of id=50 is RELEASING
    mockGetAnimeSequels.mockResolvedValue([makeSequel(51, 'RELEASING')])
    const res = (await GET(makeReq({ ids: '1' }))) as {
      body: Record<string, { hasReleasingAhead: boolean }>
    }
    expect(res.body['1'].hasReleasingAhead).toBe(true)
  })

  it('marks the currently-releasing anime itself as next when status is RELEASING', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(
      new Map([[1, statusEntry('RELEASING', [], 2024)]])
    )
    const res = (await GET(makeReq({ ids: '1' }))) as {
      body: Record<string, { next: { id: number; status: string } | null }>
    }
    expect(res.body['1'].next?.id).toBe(1)
    expect(res.body['1'].next?.status).toBe('RELEASING')
  })

  it('returns error flag for an id not present in the status map', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(new Map())
    mockBatchGetAnimeStatus.mockResolvedValue(new Map()) // id=99 missing from AniList too
    const res = (await GET(makeReq({ ids: '99' }))) as {
      body: Record<string, { error?: boolean }>
    }
    expect(res.body['99'].error).toBe(true)
  })

  it('returns error flags for all ids when status batch fetch throws', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(new Map())
    mockBatchGetAnimeStatus.mockRejectedValue(new Error('AniList down'))
    const res = (await GET(makeReq({ ids: '1,2' }))) as {
      body: Record<string, { error?: boolean }>
    }
    expect(res.body['1'].error).toBe(true)
    expect(res.body['2'].error).toBe(true)
  })

  it('calls deleteStatusCacheBatch and deleteSeasonCacheBatch when clearCache is set', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(new Map([[1, statusEntry('FINISHED')]]))
    await GET(makeReq({ ids: '1', clearCache: '1' }))
    expect(mockDeleteStatusCacheBatch).toHaveBeenCalledWith([1])
    expect(mockDeleteSeasonCacheBatch).toHaveBeenCalledWith([1])
  })

  it('picks the earliest upcoming sequel by start date', async () => {
    const s1 = makeSequel(10, 'NOT_YET_RELEASED', 2025)
    s1.startDate = { year: 2025, month: 4, day: null }
    const s2 = makeSequel(11, 'NOT_YET_RELEASED', 2025)
    s2.startDate = { year: 2025, month: 1, day: null }
    mockGetStatusCacheBatch.mockResolvedValue(
      new Map([[1, statusEntry('FINISHED', [s1, s2])]])
    )
    const res = (await GET(makeReq({ ids: '1' }))) as {
      body: Record<string, { next: { id: number } | null }>
    }
    expect(res.body['1'].next?.id).toBe(11) // January comes before April
  })

  it('finds a finished later season via the full season chain when direct sequels is empty', async () => {
    mockGetStatusCacheBatch.mockResolvedValue(new Map([[1, statusEntry('FINISHED')]]))
    // getCachedAllSeasons returns a chain with a later FINISHED season at index 1
    mockGetCachedAllSeasons.mockResolvedValue([
      {
        id: 1,
        title: { romaji: 'S1', english: null },
        coverImage: { large: '' },
        status: 'FINISHED',
        seasonYear: 2020,
        season: 'SPRING',
        format: 'TV',
        popularity: 100,
        episodes: 12,
        nextAiringEpisode: null,
        startDate: null,
      },
      {
        id: 2,
        title: { romaji: 'S2', english: 'S2 English' },
        coverImage: { large: '' },
        status: 'FINISHED',
        seasonYear: 2022,
        season: 'FALL',
        format: 'TV',
        popularity: 100,
        episodes: 12,
        nextAiringEpisode: null,
        startDate: null,
      },
    ])
    const res = (await GET(makeReq({ ids: '1' }))) as {
      body: Record<string, { available: { id: number } | null }>
    }
    expect(res.body['1'].available?.id).toBe(2)
  })
})
