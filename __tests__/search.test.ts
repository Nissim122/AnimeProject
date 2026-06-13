import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const {
  mockSearchAnime,
  mockIsHebrew,
  mockTranslateHebrewToEnglish,
  mockHebrewToKeywords,
} = vi.hoisted(() => ({
  mockSearchAnime: vi.fn(),
  mockIsHebrew: vi.fn(),
  mockTranslateHebrewToEnglish: vi.fn(),
  mockHebrewToKeywords: vi.fn(),
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
  searchAnime: mockSearchAnime,
  withRateLimit: vi.fn().mockImplementation((fn: () => unknown) => fn()),
}))

vi.mock('@/lib/translate', () => ({
  isHebrew: mockIsHebrew,
  translateHebrewToEnglish: mockTranslateHebrewToEnglish,
  hebrewToKeywords: mockHebrewToKeywords,
}))

// ─── Import after mocks ────────────────────────
import { GET } from '@/app/api/search/route'

// ─── Helpers ───────────────────────────────────
function makeReq(q?: string) {
  return {
    nextUrl: { searchParams: new URLSearchParams(q ? { q } : {}) },
  } as Parameters<typeof GET>[0]
}

const ANIME_1 = {
  id: 1,
  title: { english: 'Naruto', romaji: 'Naruto' },
  coverImage: { large: '' },
  format: 'TV',
  status: 'FINISHED',
  popularity: 100,
  relations: { edges: [] },
}
const ANIME_2 = {
  id: 2,
  title: { english: 'Naruto Shippuden', romaji: 'Naruto Shippuden' },
  coverImage: { large: '' },
  format: 'TV',
  status: 'FINISHED',
  popularity: 80,
  relations: { edges: [] },
}

// ─── Tests ─────────────────────────────────────
describe('GET /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsHebrew.mockReturnValue(false)
    mockHebrewToKeywords.mockResolvedValue([])
  })

  it('returns empty results for a missing query', async () => {
    const res = (await GET(makeReq())) as unknown as { body: { results: unknown[] } }
    expect(res.body).toEqual({ results: [] })
  })

  it('returns empty results for a single-character query', async () => {
    const res = (await GET(makeReq('N'))) as unknown as { body: { results: unknown[] } }
    expect(res.body).toEqual({ results: [] })
  })

  it('calls AniList directly for an English query', async () => {
    mockSearchAnime.mockResolvedValue([ANIME_1, ANIME_2])
    const res = (await GET(makeReq('Naruto'))) as unknown as { body: { results: unknown[] } }
    expect(mockSearchAnime).toHaveBeenCalledWith('Naruto')
    expect(res.body.results).toHaveLength(2)
  })

  it('groups SEQUEL/PREQUEL pairs into one result entry', async () => {
    const s1 = { ...ANIME_1, relations: { edges: [{ relationType: 'SEQUEL', node: { id: 2 } }] } }
    const s2 = { ...ANIME_2, relations: { edges: [{ relationType: 'PREQUEL', node: { id: 1 } }] } }
    mockSearchAnime.mockResolvedValue([s1, s2])
    const res = (await GET(makeReq('Naruto'))) as unknown as { body: { results: unknown[] } }
    expect(res.body.results).toHaveLength(1)
  })

  it('translates a Hebrew query before searching', async () => {
    mockIsHebrew.mockReturnValue(true)
    mockTranslateHebrewToEnglish.mockResolvedValue('Naruto')
    mockSearchAnime.mockResolvedValue([ANIME_1])
    await GET(makeReq('נארוטו'))
    expect(mockTranslateHebrewToEnglish).toHaveBeenCalledWith('נארוטו')
  })

  it('runs keyword fallback when fewer than 3 results for Hebrew query', async () => {
    mockIsHebrew.mockReturnValue(true)
    mockTranslateHebrewToEnglish.mockResolvedValue('Sword Art Online')
    mockHebrewToKeywords.mockResolvedValue(['sword', 'art'])
    // phrase search returns 1, raw Hebrew returns 0, keyword calls add a new one
    mockSearchAnime
      .mockResolvedValueOnce([ANIME_1])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ANIME_2])
      .mockResolvedValue([])
    const res = (await GET(makeReq('חרב אמנות'))) as unknown as { body: { results: unknown[] } }
    expect(mockHebrewToKeywords).toHaveBeenCalled()
    expect(res.body.results.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty results gracefully when AniList throws', async () => {
    mockSearchAnime.mockRejectedValue(new Error('AniList down'))
    const res = (await GET(makeReq('Naruto'))) as unknown as { body: { results: unknown[] } }
    expect(res.body.results).toEqual([])
  })

  it('does not call translation for a non-Hebrew query', async () => {
    mockSearchAnime.mockResolvedValue([])
    await GET(makeReq('One Piece'))
    expect(mockTranslateHebrewToEnglish).not.toHaveBeenCalled()
  })
})
