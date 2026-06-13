/**
 * Tests for GET /POST /api/refresh-season-cache
 *
 * Scenarios:
 *  - No CRON_SECRET set → auth always passes (open endpoint)
 *  - Wrong Bearer token → 401
 *  - Correct Bearer token → runs refresh
 *  - Run flow: clears both caches → fetches all distinct anilistIds → batches status (50/batch)
 *    → refreshes season cache → returns { total, status, seasons }
 *  - Status batch error → statusErrors++ but continues
 *  - POST endpoint is also protected and runs same flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoist mocks ────────────────────────────────
const {
  mockFindMany,
  mockBatchGetAnimeStatus,
  mockSetStatusCacheBatch,
  mockClearStatusCache,
  mockRefreshCacheForIds,
  mockClearSeasonCache,
  mockWithRateLimit,
  mockDelay,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockBatchGetAnimeStatus: vi.fn(),
  mockSetStatusCacheBatch: vi.fn(),
  mockClearStatusCache: vi.fn(),
  mockRefreshCacheForIds: vi.fn(),
  mockClearSeasonCache: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockDelay: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trackedAnime: { findMany: mockFindMany },
  },
}))

vi.mock('@/lib/anilist', () => ({
  batchGetAnimeStatus: mockBatchGetAnimeStatus,
  withRateLimit: mockWithRateLimit,
  delay: mockDelay,
}))

vi.mock('@/lib/statusCache', () => ({
  setStatusCacheBatch: mockSetStatusCacheBatch,
  clearStatusCache: mockClearStatusCache,
}))

vi.mock('@/lib/seasonCache', () => ({
  refreshCacheForIds: mockRefreshCacheForIds,
  clearSeasonCache: mockClearSeasonCache,
}))

// ─── Import after mocks ──────────────────────────
import { GET, POST } from '@/app/api/refresh-season-cache/route'

// ─── Helpers ────────────────────────────────────
function makeReq(opts: { authHeader?: string } = {}) {
  return {
    headers: {
      get: (key: string) => (key === 'authorization' ? opts.authHeader ?? null : null),
    },
  } as unknown as Request
}

// ─── Tests ──────────────────────────────────────
describe('GET /api/refresh-season-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CRON_SECRET

    // withRateLimit immediately invokes callback
    mockWithRateLimit.mockImplementation((fn: () => unknown) => fn())
    mockClearStatusCache.mockResolvedValue(undefined)
    mockClearSeasonCache.mockResolvedValue(undefined)
    mockFindMany.mockResolvedValue([{ anilistId: 1 }, { anilistId: 2 }])
    mockBatchGetAnimeStatus.mockResolvedValue(new Map([[1, { status: 'FINISHED', sequels: [] }], [2, { status: 'RELEASING', sequels: [] }]]))
    mockSetStatusCacheBatch.mockResolvedValue(undefined)
    mockRefreshCacheForIds.mockResolvedValue({ refreshed: 2, errors: 0, skipped: 0 })
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('passes auth when CRON_SECRET is not set', async () => {
    const res = (await GET(makeReq())) as unknown as { status: number }
    expect(res.status).not.toBe(401)
  })

  it('returns 401 when CRON_SECRET is set and Authorization header is wrong', async () => {
    process.env.CRON_SECRET = 'my-secret'
    const res = (await GET(makeReq({ authHeader: 'Bearer wrong' }))) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('passes auth when CRON_SECRET matches Bearer token', async () => {
    process.env.CRON_SECRET = 'my-secret'
    const res = (await GET(makeReq({ authHeader: 'Bearer my-secret' }))) as unknown as { status: number; body: unknown }
    expect(res.status).not.toBe(401)
  })

  it('clears both caches before fetching', async () => {
    await GET(makeReq())
    expect(mockClearStatusCache).toHaveBeenCalledOnce()
    expect(mockClearSeasonCache).toHaveBeenCalledOnce()
  })

  it('fetches distinct anilistIds from trackedAnime', async () => {
    await GET(makeReq())
    expect(mockFindMany).toHaveBeenCalledWith({
      select: { anilistId: true },
      distinct: ['anilistId'],
    })
  })

  it('batches status in groups of 50 and writes to cache', async () => {
    // 52 ids → 2 batches (50 + 2)
    const ids = Array.from({ length: 52 }, (_, i) => ({ anilistId: i + 1 }))
    mockFindMany.mockResolvedValue(ids)
    const statusMap = new Map(ids.map((r) => [r.anilistId, { status: 'FINISHED', sequels: [] }]))
    mockBatchGetAnimeStatus.mockResolvedValue(statusMap)

    await GET(makeReq())

    expect(mockBatchGetAnimeStatus).toHaveBeenCalledTimes(2)
    const firstBatch = mockBatchGetAnimeStatus.mock.calls[0][0]
    expect(firstBatch).toHaveLength(50)
    const secondBatch = mockBatchGetAnimeStatus.mock.calls[1][0]
    expect(secondBatch).toHaveLength(2)
  })

  it('calls refreshCacheForIds with all anilistIds', async () => {
    await GET(makeReq())
    expect(mockRefreshCacheForIds).toHaveBeenCalledWith([1, 2])
  })

  it('returns { total, status, seasons } with correct counts', async () => {
    const res = (await GET(makeReq())) as unknown as {
      body: { total: number; status: { refreshed: number; errors: number }; seasons: unknown }
    }
    expect(res.body.total).toBe(2)
    expect(res.body.status.refreshed).toBe(2)
    expect(res.body.status.errors).toBe(0)
    expect(res.body.seasons).toEqual({ refreshed: 2, errors: 0 })
  })

  it('counts statusErrors when a batch throws and continues', async () => {
    const ids = [{ anilistId: 1 }, { anilistId: 2 }]
    mockFindMany.mockResolvedValue(ids)
    mockBatchGetAnimeStatus.mockRejectedValue(new Error('AniList down'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = (await GET(makeReq())) as unknown as {
      body: { status: { refreshed: number; errors: number } }
    }
    consoleSpy.mockRestore()

    expect(res.body.status.errors).toBe(2) // whole batch counted as errors
    expect(res.body.status.refreshed).toBe(0)
    expect(mockRefreshCacheForIds).toHaveBeenCalled() // seasons still runs
  })

  it('returns total=0 when no anime tracked', async () => {
    mockFindMany.mockResolvedValue([])
    mockRefreshCacheForIds.mockResolvedValue({ refreshed: 0, errors: 0, skipped: 0 })

    const res = (await GET(makeReq())) as unknown as { body: { total: number } }
    expect(res.body.total).toBe(0)
    expect(mockBatchGetAnimeStatus).not.toHaveBeenCalled()
  })
})

describe('POST /api/refresh-season-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CRON_SECRET
    mockWithRateLimit.mockImplementation((fn: () => unknown) => fn())
    mockClearStatusCache.mockResolvedValue(undefined)
    mockClearSeasonCache.mockResolvedValue(undefined)
    mockFindMany.mockResolvedValue([])
    mockBatchGetAnimeStatus.mockResolvedValue(new Map())
    mockSetStatusCacheBatch.mockResolvedValue(undefined)
    mockRefreshCacheForIds.mockResolvedValue({ refreshed: 0, errors: 0, skipped: 0 })
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  it('returns 401 when CRON_SECRET is set and token is wrong', async () => {
    process.env.CRON_SECRET = 'secret'
    const res = (await POST(makeReq({ authHeader: 'Bearer wrong' }))) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('runs the same refresh flow as GET', async () => {
    await POST(makeReq())
    expect(mockClearStatusCache).toHaveBeenCalled()
    expect(mockClearSeasonCache).toHaveBeenCalled()
    expect(mockRefreshCacheForIds).toHaveBeenCalled()
  })
})
