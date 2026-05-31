import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const { mockFindMany, mockUpsert } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    statusCache: {
      findMany: mockFindMany,
      upsert: mockUpsert,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}))

// ─── Import after mocks ────────────────────────
import { getStatusCacheBatch, setStatusCacheBatch } from '@/lib/statusCache'

// ─── Helpers ───────────────────────────────────
const TTL_7_DAYS = 7 * 24 * 60 * 60 * 1000

function recentDate() {
  return new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
}

function expiredDate() {
  return new Date(Date.now() - TTL_7_DAYS - 1000) // just beyond 7 days
}

const SEQUEL_NODE = {
  id: 2,
  format: 'TV',
  title: { romaji: 'S2' },
  status: 'NOT_YET_RELEASED',
  startDate: { year: 2025, month: null, day: null },
}

// ─── getStatusCacheBatch ───────────────────────
describe('getStatusCacheBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an empty Map without querying DB when ids is empty', async () => {
    const result = await getStatusCacheBatch([])
    expect(result.size).toBe(0)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns entries that are within the 7-day TTL', async () => {
    mockFindMany.mockResolvedValue([
      {
        anilistId: 1,
        status: 'FINISHED',
        startDateJson: JSON.stringify({ year: 2020, month: 4, day: null }),
        sequelsJson: JSON.stringify([SEQUEL_NODE]),
        updatedAt: recentDate(),
      },
    ])
    const result = await getStatusCacheBatch([1])
    expect(result.size).toBe(1)
    const entry = result.get(1)!
    expect(entry.status).toBe('FINISHED')
    expect(entry.startDate).toEqual({ year: 2020, month: 4, day: null })
    expect(entry.sequels).toEqual([SEQUEL_NODE])
  })

  it('excludes entries older than the 7-day TTL', async () => {
    mockFindMany.mockResolvedValue([
      {
        anilistId: 1,
        status: 'FINISHED',
        startDateJson: JSON.stringify({ year: 2020, month: null, day: null }),
        sequelsJson: '[]',
        updatedAt: expiredDate(),
      },
    ])
    const result = await getStatusCacheBatch([1])
    expect(result.size).toBe(0)
  })

  it('correctly separates fresh and expired entries', async () => {
    mockFindMany.mockResolvedValue([
      {
        anilistId: 1,
        status: 'FINISHED',
        startDateJson: '{}',
        sequelsJson: '[]',
        updatedAt: recentDate(),
      },
      {
        anilistId: 2,
        status: 'RELEASING',
        startDateJson: '{}',
        sequelsJson: '[]',
        updatedAt: expiredDate(),
      },
    ])
    const result = await getStatusCacheBatch([1, 2])
    expect(result.has(1)).toBe(true)
    expect(result.has(2)).toBe(false)
  })

  it('parses sequelsJson back to an array of RelationNodes', async () => {
    mockFindMany.mockResolvedValue([
      {
        anilistId: 5,
        status: 'FINISHED',
        startDateJson: JSON.stringify({ year: 2021, month: 1, day: null }),
        sequelsJson: JSON.stringify([SEQUEL_NODE]),
        updatedAt: recentDate(),
      },
    ])
    const result = await getStatusCacheBatch([5])
    expect(result.get(5)?.sequels).toEqual([SEQUEL_NODE])
  })

  it('queries DB with the provided id list', async () => {
    mockFindMany.mockResolvedValue([])
    await getStatusCacheBatch([10, 20, 30])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { anilistId: { in: [10, 20, 30] } },
    })
  })
})

// ─── setStatusCacheBatch ───────────────────────
describe('setStatusCacheBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({})
  })

  it('does nothing when entries array is empty', async () => {
    await setStatusCacheBatch([])
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('calls upsert for each entry', async () => {
    await setStatusCacheBatch([
      [1, { status: 'FINISHED', startDate: { year: 2020, month: null, day: null }, sequels: [] }],
      [2, { status: 'RELEASING', startDate: { year: 2021, month: 4, day: null }, sequels: [SEQUEL_NODE] }],
    ])
    expect(mockUpsert).toHaveBeenCalledTimes(2)
  })

  it('serialises startDate and sequels to JSON strings', async () => {
    const startDate = { year: 2022, month: 7, day: 15 }
    await setStatusCacheBatch([
      [3, { status: 'FINISHED', startDate, sequels: [SEQUEL_NODE] }],
    ])
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          startDateJson: JSON.stringify(startDate),
          sequelsJson: JSON.stringify([SEQUEL_NODE]),
        }),
      })
    )
  })
})
