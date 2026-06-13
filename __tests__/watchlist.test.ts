import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const { mockAuth, mockFindMany, mockFindUnique, mockCreate, mockDeleteMany } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    mockFindMany: vi.fn(),
    mockFindUnique: vi.fn(),
    mockCreate: vi.fn(),
    mockDeleteMany: vi.fn(),
  })
)

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
    watchListItem: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      deleteMany: mockDeleteMany,
    },
  },
}))

// ─── Import after mocks ────────────────────────
import { GET, POST, DELETE } from '@/app/api/watchlist/route'

// ─── Helpers ───────────────────────────────────
type ReqOpts = { body?: Record<string, unknown>; anilistId?: number }

function makeReq({ body, anilistId }: ReqOpts = {}) {
  const params = new URLSearchParams(anilistId ? { anilistId: String(anilistId) } : {})
  const url = `http://localhost:3000/api/watchlist${anilistId ? `?anilistId=${anilistId}` : ''}`
  return {
    json: async () => body ?? {},
    nextUrl: { searchParams: params },
    url,
  } as Parameters<typeof POST>[0]
}

// ─── GET tests ─────────────────────────────────
describe('GET /api/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await GET()) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns all watchlist items ordered by addedAt desc', async () => {
    const items = [{ id: 1, anilistId: 100, title: 'Naruto', addedAt: new Date() }]
    mockFindMany.mockResolvedValue(items)
    const res = (await GET()) as unknown as { body: { items: unknown[] } }
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { addedAt: 'desc' },
    })
    expect(res.body).toEqual({ items })
  })

  it('returns an empty array when the watchlist is empty', async () => {
    mockFindMany.mockResolvedValue([])
    const res = (await GET()) as unknown as { body: { items: unknown[] } }
    expect(res.body).toEqual({ items: [] })
  })

  it('returns 500 on DB failure', async () => {
    mockFindMany.mockRejectedValue(new Error('DB error'))
    const res = (await GET()) as unknown as { status: number }
    expect(res.status).toBe(500)
  })
})

// ─── POST tests ────────────────────────────────
describe('POST /api/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await POST(makeReq({ body: { anilistId: 1, title: 'Test' } }))) as unknown as {
      status: number
    }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await POST(makeReq({ body: { title: 'Test' } }))) as unknown as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is missing', async () => {
    const res = (await POST(makeReq({ body: { anilistId: 1 } }))) as unknown as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns existing item without creating a duplicate', async () => {
    const existing = { id: 1, anilistId: 100, title: 'Naruto' }
    mockFindUnique.mockResolvedValue(existing)
    const res = (await POST(makeReq({ body: { anilistId: 100, title: 'Naruto' } }))) as unknown as {
      body: { item: unknown; existing: boolean }
    }
    expect(mockCreate).not.toHaveBeenCalled()
    expect(res.body).toEqual({ item: existing, existing: true })
  })

  it('creates a new watchlist item and returns it', async () => {
    const created = { id: 2, anilistId: 200, title: 'One Piece' }
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue(created)
    const res = (await POST(makeReq({ body: { anilistId: 200, title: 'One Piece' } }))) as unknown as {
      body: { item: unknown }
    }
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', anilistId: 200, title: 'One Piece' }),
      })
    )
    expect(res.body).toEqual({ item: created })
  })

  it('stores null for missing coverImage', async () => {
    const created = { id: 3, anilistId: 300, title: 'Bleach', coverImage: null }
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue(created)
    await POST(makeReq({ body: { anilistId: 300, title: 'Bleach' } }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ coverImage: null }) })
    )
  })
})

// ─── DELETE tests ──────────────────────────────
describe('DELETE /api/watchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await DELETE(makeReq({ anilistId: 100 }))) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await DELETE(makeReq())) as unknown as { status: number }
    expect(res.status).toBe(400)
  })

  it('deletes the item for the correct user and returns ok', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })
    const res = (await DELETE(makeReq({ anilistId: 100 }))) as unknown as { body: { ok: boolean } }
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', anilistId: 100 } })
    expect(res.body).toEqual({ ok: true })
  })

  it('returns 500 on DB failure', async () => {
    mockDeleteMany.mockRejectedValue(new Error('DB error'))
    const res = (await DELETE(makeReq({ anilistId: 100 }))) as unknown as { status: number }
    expect(res.status).toBe(500)
  })
})
