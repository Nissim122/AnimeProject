import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const {
  mockFindUnique,
  mockFindMany,
  mockUpsert,
  mockGetAllSeasons,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
  mockGetAllSeasons: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    seasonCache: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      upsert: mockUpsert,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}))

vi.mock('@/lib/anilist', () => ({
  getAllSeasons: mockGetAllSeasons,
}))

// ─── Import after mocks ────────────────────────
import { getCachedAllSeasons, refreshCacheForIds } from '@/lib/seasonCache'

// ─── Helpers ───────────────────────────────────
const TTL_7_DAYS = 7 * 24 * 60 * 60 * 1000

const SEASON_1 = { id: 1, title: { romaji: 'S1', english: null }, coverImage: { large: '' }, status: 'FINISHED', seasonYear: 2020, season: 'SPRING', format: 'TV', popularity: 100, episodes: 12, nextAiringEpisode: null, startDate: null }

function recentDate(): Date {
  return new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
}

function expiredDate(): Date {
  return new Date(Date.now() - TTL_7_DAYS - 1000) // just beyond TTL
}

// ─── getCachedAllSeasons ───────────────────────
describe('getCachedAllSeasons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAllSeasons.mockResolvedValue([SEASON_1])
    mockUpsert.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns cached data when cache is valid and within TTL', async () => {
    mockFindUnique.mockResolvedValue({
      anilistId: 1,
      seasonsJson: JSON.stringify([SEASON_1]),
      updatedAt: recentDate(),
    })
    const result = await getCachedAllSeasons(1)
    expect(result).toEqual([SEASON_1])
    expect(mockGetAllSeasons).not.toHaveBeenCalled()
  })

  it('fetches from AniList when there is no cache entry', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await getCachedAllSeasons(1)
    expect(mockGetAllSeasons).toHaveBeenCalledWith(1)
    expect(result).toEqual([SEASON_1])
  })

  it('persists the fetched result via upsert', async () => {
    mockFindUnique.mockResolvedValue(null)
    await getCachedAllSeasons(1)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { anilistId: 1 } })
    )
  })

  it('re-fetches when the cached entry is past TTL', async () => {
    mockFindUnique.mockResolvedValue({
      anilistId: 1,
      seasonsJson: JSON.stringify([SEASON_1]),
      updatedAt: expiredDate(),
    })
    const result = await getCachedAllSeasons(1)
    expect(mockGetAllSeasons).toHaveBeenCalled()
    expect(result).toEqual([SEASON_1])
  })

  it('does NOT upsert when AniList returns an empty array', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockGetAllSeasons.mockResolvedValue([])
    const result = await getCachedAllSeasons(99)
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it('treats an empty-array cache entry as invalid and re-fetches', async () => {
    mockFindUnique.mockResolvedValue({
      anilistId: 1,
      seasonsJson: '[]',
      updatedAt: recentDate(),
    })
    const result = await getCachedAllSeasons(1)
    expect(mockGetAllSeasons).toHaveBeenCalled()
    expect(result).toEqual([SEASON_1])
  })

  it('treats a non-array cache entry as invalid and re-fetches', async () => {
    mockFindUnique.mockResolvedValue({
      anilistId: 1,
      seasonsJson: 'null',
      updatedAt: recentDate(),
    })
    const result = await getCachedAllSeasons(1)
    expect(mockGetAllSeasons).toHaveBeenCalled()
    expect(result).toEqual([SEASON_1])
  })
})

// ─── refreshCacheForIds ────────────────────────
describe('refreshCacheForIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAllSeasons.mockResolvedValue([SEASON_1])
    mockUpsert.mockResolvedValue({})
  })

  it('skips IDs that already have a valid non-empty cache entry', async () => {
    mockFindMany.mockResolvedValue([
      { anilistId: 1, seasonsJson: JSON.stringify([SEASON_1]) },
    ])
    const result = await refreshCacheForIds([1])
    expect(mockGetAllSeasons).not.toHaveBeenCalled()
    expect(result).toEqual({ refreshed: 0, errors: 0, skipped: 1 })
  })

  it('refreshes IDs that have no cache entry', async () => {
    mockFindMany.mockResolvedValue([])
    const result = await refreshCacheForIds([1])
    expect(mockGetAllSeasons).toHaveBeenCalledWith(1)
    expect(result).toEqual({ refreshed: 1, errors: 0, skipped: 0 })
  })

  it('refreshes IDs that have an empty-array cache entry', async () => {
    mockFindMany.mockResolvedValue([{ anilistId: 1, seasonsJson: '[]' }])
    const result = await refreshCacheForIds([1])
    expect(mockGetAllSeasons).toHaveBeenCalledWith(1)
    expect(result.refreshed).toBe(1)
  })

  it('counts errors when getAllSeasons throws', async () => {
    mockFindMany.mockResolvedValue([])
    mockGetAllSeasons.mockRejectedValue(new Error('AniList down'))
    const result = await refreshCacheForIds([1])
    expect(result).toEqual({ refreshed: 0, errors: 1, skipped: 0 })
  })

  it('mixes skipped, refreshed, and errors correctly', async () => {
    // id 1 → valid cache (skip), id 2 → no cache (refresh), id 3 → no cache + error
    mockFindMany.mockResolvedValue([
      { anilistId: 1, seasonsJson: JSON.stringify([SEASON_1]) },
    ])
    mockGetAllSeasons
      .mockResolvedValueOnce([SEASON_1])     // id 2 succeeds
      .mockRejectedValueOnce(new Error('x')) // id 3 fails
    const result = await refreshCacheForIds([1, 2, 3])
    expect(result).toEqual({ refreshed: 1, errors: 1, skipped: 1 })
  })

  it('does not upsert when getAllSeasons returns empty', async () => {
    mockFindMany.mockResolvedValue([])
    mockGetAllSeasons.mockResolvedValue([])
    const result = await refreshCacheForIds([1])
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(result).toEqual({ refreshed: 0, errors: 0, skipped: 0 })
  })
})
