import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const {
  mockAuth,
  mockFindUnique,
  mockCreate,
  mockCreateMany,
  mockUpdate,
  mockDelete,
  mockGetAnimeSequels,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockCreateMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockGetAnimeSequels: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trackedAnime: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    knownSequel: { createMany: mockCreateMany },
  },
}))

vi.mock('@/lib/anilist', () => ({
  getAnimeSequels: mockGetAnimeSequels,
}))

// ─── Import after mocks ────────────────────────
import { POST, PATCH, DELETE } from '@/app/api/track/route'

// ─── Helpers ───────────────────────────────────
type ReqOpts = { body?: Record<string, unknown>; anilistId?: number }

function makeReq({ body, anilistId }: ReqOpts = {}) {
  const params = new URLSearchParams(anilistId ? { anilistId: String(anilistId) } : {})
  return {
    json: async () => body ?? {},
    nextUrl: { searchParams: params },
    url: `http://localhost:3000/api/track${anilistId ? `?anilistId=${anilistId}` : ''}`,
  } as Parameters<typeof POST>[0]
}

// ─── POST tests ────────────────────────────────
describe('POST /api/track', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
    mockGetAnimeSequels.mockResolvedValue([])
    mockCreateMany.mockResolvedValue({ count: 0 })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await POST(makeReq({ body: { anilistId: 1, title: 'Test' } }))) as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await POST(makeReq({ body: { title: 'Test' } }))) as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is missing', async () => {
    const res = (await POST(makeReq({ body: { anilistId: 1 } }))) as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns existing entry without creating a duplicate', async () => {
    const existing = { id: 1, anilistId: 100, title: 'Naruto', userId: 'user-1' }
    mockFindUnique.mockResolvedValue(existing)
    const res = (await POST(makeReq({ body: { anilistId: 100, title: 'Naruto' } }))) as {
      body: { message: string; anime: unknown }
    }
    expect(mockCreate).not.toHaveBeenCalled()
    expect(res.body).toEqual({ message: 'Already tracked', anime: existing })
  })

  it('creates a new tracked entry and saves known sequels', async () => {
    const created = { id: 2, anilistId: 200, title: 'One Piece', userId: 'user-1' }
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue(created)
    mockGetAnimeSequels.mockResolvedValue([{ id: 201 }, { id: 202 }])
    const res = (await POST(makeReq({ body: { anilistId: 200, title: 'One Piece' } }))) as {
      body: { anime: unknown }
    }
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ anilistId: 200 }) })
    )
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { trackedAnimeId: 2, sequelAnilistId: 201 },
        { trackedAnimeId: 2, sequelAnilistId: 202 },
      ],
    })
    expect(res.body).toEqual({ anime: created })
  })

  it('still creates the entry even if sequel fetch fails', async () => {
    const created = { id: 3, anilistId: 300, title: 'Bleach', userId: 'user-1' }
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue(created)
    mockGetAnimeSequels.mockRejectedValue(new Error('AniList error'))
    const res = (await POST(makeReq({ body: { anilistId: 300, title: 'Bleach' } }))) as {
      body: { anime: unknown }
    }
    expect(res.body).toEqual({ anime: created })
    expect(mockCreateMany).not.toHaveBeenCalled()
  })
})

// ─── DELETE tests ──────────────────────────────
describe('DELETE /api/track', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await DELETE(makeReq({ anilistId: 100 }))) as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await DELETE(makeReq())) as { status: number }
    expect(res.status).toBe(400)
  })

  it('deletes the tracked anime and returns success', async () => {
    mockDelete.mockResolvedValue({})
    const res = (await DELETE(makeReq({ anilistId: 100 }))) as { body: { success: boolean } }
    expect(mockDelete).toHaveBeenCalledWith({
      where: { userId_anilistId: { userId: 'user-1', anilistId: 100 } },
    })
    expect(res.body).toEqual({ success: true })
  })

  it('returns 500 when DB delete throws', async () => {
    mockDelete.mockRejectedValue(new Error('DB error'))
    const res = (await DELETE(makeReq({ anilistId: 100 }))) as { status: number }
    expect(res.status).toBe(500)
  })
})

// ─── PATCH tests ───────────────────────────────
describe('PATCH /api/track', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await PATCH(makeReq({ body: { anilistId: 100, note: 'good' } }))) as {
      status: number
    }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await PATCH(makeReq({ body: { note: 'good' } }))) as { status: number }
    expect(res.status).toBe(400)
  })

  it('updates the note and returns the updated entry', async () => {
    const updated = { id: 1, anilistId: 100, note: 'great anime' }
    mockUpdate.mockResolvedValue(updated)
    const res = (await PATCH(makeReq({ body: { anilistId: 100, note: 'great anime' } }))) as {
      body: { anime: unknown }
    }
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { userId_anilistId: { userId: 'user-1', anilistId: 100 } },
      data: { note: 'great anime' },
    })
    expect(res.body).toEqual({ anime: updated })
  })

  it('trims whitespace-only note to null', async () => {
    mockUpdate.mockResolvedValue({ id: 1, anilistId: 100, note: null })
    await PATCH(makeReq({ body: { anilistId: 100, note: '   ' } }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { note: null } })
    )
  })
})
