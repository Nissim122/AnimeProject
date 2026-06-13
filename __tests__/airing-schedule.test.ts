import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoist mocks ────────────────────────────────
const { mockNextResponseJson, mockNextResponseHtml } = vi.hoisted(() => ({
  mockNextResponseJson: vi.fn((body: unknown, init?: { status?: number }) => ({
    body,
    status: init?.status ?? 200,
  })),
  mockNextResponseHtml: vi.fn(),
}))

vi.mock('next/server', () => {
  const NR = function (body: unknown, init?: { headers?: Record<string, string> }) {
    mockNextResponseHtml(body, init)
    return { _html: body, _init: init }
  }
  NR.json = mockNextResponseJson
  return { NextResponse: NR, NextRequest: class {} }
})

// ─── Import after mocks ──────────────────────────
import { GET } from '@/app/api/airing-schedule/route'

// ─── Helpers ────────────────────────────────────
function makeReq(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params)
  return { nextUrl: { searchParams: sp } } as Parameters<typeof GET>[0]
}

function anilistOk(data: unknown) {
  return { ok: true, status: 200, json: async () => data }
}

// ─── Tests ──────────────────────────────────────
describe('GET /api/airing-schedule', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns 400 when id param is missing', async () => {
    const res = (await GET(makeReq())) as { status: number }
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns 400 when id is not a number', async () => {
    const res = (await GET(makeReq({ id: 'abc' }))) as { status: number }
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns status, nextAiringEpisode, and sorted upcoming on success', async () => {
    mockFetch.mockResolvedValue(
      anilistOk({
        data: {
          Media: {
            status: 'RELEASING',
            nextAiringEpisode: { episode: 5, airingAt: 9999 },
            airingSchedule: {
              nodes: [
                { episode: 7, airingAt: 30000 },
                { episode: 5, airingAt: 10000 },
                { episode: 6, airingAt: 20000 },
              ],
            },
          },
        },
      })
    )
    const res = (await GET(makeReq({ id: '1' }))) as {
      body: { status: string; nextAiringEpisode: unknown; upcoming: Array<{ episode: number }> }
    }
    expect(res.body.status).toBe('RELEASING')
    expect(res.body.nextAiringEpisode).toEqual({ episode: 5, airingAt: 9999 })
    // Sorted by episode number ascending
    expect(res.body.upcoming.map((u) => u.episode)).toEqual([5, 6, 7])
  })

  it('returns empty upcoming when airingSchedule.nodes is absent', async () => {
    mockFetch.mockResolvedValue(
      anilistOk({
        data: {
          Media: { status: 'NOT_YET_RELEASED', nextAiringEpisode: null, airingSchedule: null },
        },
      })
    )
    const res = (await GET(makeReq({ id: '1' }))) as {
      body: { upcoming: unknown[]; nextAiringEpisode: unknown }
    }
    expect(res.body.upcoming).toEqual([])
    expect(res.body.nextAiringEpisode).toBeNull()
  })

  it('returns { upcoming: [], nextAiringEpisode: null } when Media is null', async () => {
    mockFetch.mockResolvedValue(anilistOk({ data: { Media: null } }))
    const res = (await GET(makeReq({ id: '1' }))) as {
      body: { upcoming: unknown[]; nextAiringEpisode: unknown }
    }
    expect(res.body.upcoming).toEqual([])
    expect(res.body.nextAiringEpisode).toBeNull()
  })

  it('returns 500 and empty payload when AniList fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const res = (await GET(makeReq({ id: '1' }))) as {
      status: number
      body: { upcoming: unknown[]; nextAiringEpisode: unknown }
    }
    expect(res.status).toBe(500)
    expect(res.body.upcoming).toEqual([])
    expect(res.body.nextAiringEpisode).toBeNull()
  })

  it('returns 500 and empty payload when AniList responds with non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })
    const res = (await GET(makeReq({ id: '1' }))) as { status: number }
    expect(res.status).toBe(500)
  })

  it('passes the numeric id as a variable to AniList', async () => {
    mockFetch.mockResolvedValue(
      anilistOk({ data: { Media: { status: 'FINISHED', nextAiringEpisode: null, airingSchedule: { nodes: [] } } } })
    )
    await GET(makeReq({ id: '42' }))
    const bodyParsed = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(bodyParsed.variables).toEqual({ id: 42 })
  })
})
