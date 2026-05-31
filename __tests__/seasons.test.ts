import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const { mockGetAllSeasons } = vi.hoisted(() => ({
  mockGetAllSeasons: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

vi.mock('@/lib/anilist', () => ({
  getAllSeasons: mockGetAllSeasons,
  withRateLimit: vi.fn().mockImplementation((fn: () => unknown) => fn()),
}))

// ─── Import after mocks ────────────────────────
import { GET } from '@/app/api/seasons/route'

// ─── Helpers ───────────────────────────────────
function makeReq(id?: string) {
  return {
    nextUrl: { searchParams: new URLSearchParams(id ? { id } : {}) },
  } as Parameters<typeof GET>[0]
}

const SEASONS = [
  {
    id: 100,
    title: { english: 'Anime S1', romaji: 'Anime S1' },
    coverImage: { large: '' },
    status: 'FINISHED',
    seasonYear: 2020,
    season: 'WINTER',
    format: 'TV',
    popularity: 100,
    episodes: 12,
    nextAiringEpisode: null,
  },
  {
    id: 101,
    title: { english: 'Anime S2', romaji: 'Anime S2' },
    coverImage: { large: '' },
    status: 'RELEASING',
    seasonYear: 2024,
    season: 'SPRING',
    format: 'TV',
    popularity: 90,
    episodes: null,
    nextAiringEpisode: { episode: 5, timeUntilAiring: 86400 },
  },
]

// ─── Tests ─────────────────────────────────────
describe('GET /api/seasons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when id is missing', async () => {
    const res = (await GET(makeReq())) as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-numeric id', async () => {
    const res = (await GET(makeReq('abc'))) as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns all seasons for a valid id', async () => {
    mockGetAllSeasons.mockResolvedValue(SEASONS)
    const res = (await GET(makeReq('100'))) as { body: { seasons: unknown[] } }
    expect(mockGetAllSeasons).toHaveBeenCalledWith(100)
    expect(res.body.seasons).toHaveLength(2)
    expect(res.body.seasons).toBe(SEASONS)
  })

  it('returns a single-season array when the anime has no sequels', async () => {
    mockGetAllSeasons.mockResolvedValue([SEASONS[0]])
    const res = (await GET(makeReq('100'))) as { body: { seasons: unknown[] } }
    expect(res.body.seasons).toHaveLength(1)
  })

  it('returns 502 when AniList call fails', async () => {
    mockGetAllSeasons.mockRejectedValue(new Error('AniList timeout'))
    const res = (await GET(makeReq('100'))) as { status: number }
    expect(res.status).toBe(502)
  })
})
