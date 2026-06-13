import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ────────────────────────────────
const {
  mockAuth,
  mockFindUnique,
  mockFindMany,
  mockCreate,
  mockUpdate,
  mockDeleteMany,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDeleteMany: vi.fn(),
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
    onHoldItem: {
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      deleteMany: mockDeleteMany,
    },
  },
}))

// ─── Import after mocks ──────────────────────────
import { GET, POST, PATCH, DELETE } from '@/app/api/onhold/route'

// ─── Helpers ────────────────────────────────────
function makeReq(opts: { body?: Record<string, unknown>; anilistId?: number } = {}) {
  const url = `http://localhost/api/onhold${opts.anilistId ? `?anilistId=${opts.anilistId}` : ''}`
  return {
    json: async () => opts.body ?? {},
    url,
    nextUrl: { searchParams: new URLSearchParams(opts.anilistId ? { anilistId: String(opts.anilistId) } : {}) },
  } as Parameters<typeof POST>[0]
}

// ─── GET ────────────────────────────────────────
describe('GET /api/onhold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'u1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await GET()) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns items ordered by addedAt desc', async () => {
    const items = [{ id: 1 }, { id: 2 }]
    mockFindMany.mockResolvedValue(items)
    const res = (await GET()) as unknown as { body: { items: unknown } }
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, orderBy: { addedAt: 'desc' } })
    )
    expect(res.body.items).toEqual(items)
  })

  it('returns 500 on DB error', async () => {
    mockFindMany.mockRejectedValue(new Error('DB down'))
    const res = (await GET()) as unknown as { status: number }
    expect(res.status).toBe(500)
  })
})

// ─── POST ───────────────────────────────────────
describe('POST /api/onhold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'u1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await POST(makeReq({ body: { anilistId: 1, title: 'A' } }))) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await POST(makeReq({ body: { title: 'A' } }))) as unknown as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is missing', async () => {
    const res = (await POST(makeReq({ body: { anilistId: 1 } }))) as unknown as { status: number }
    expect(res.status).toBe(400)
  })

  it('returns existing item without creating when already on hold', async () => {
    const existing = { id: 1, anilistId: 10, userId: 'u1' }
    mockFindUnique.mockResolvedValue(existing)
    const res = (await POST(makeReq({ body: { anilistId: 10, title: 'B' } }))) as unknown as {
      body: { item: unknown; existing: boolean }
    }
    expect(mockCreate).not.toHaveBeenCalled()
    expect(res.body).toEqual({ item: existing, existing: true })
  })

  it('creates new item when not already on hold', async () => {
    const created = { id: 2, anilistId: 20, userId: 'u1' }
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue(created)
    const res = (await POST(makeReq({ body: { anilistId: 20, title: 'C', coverImage: 'http://img.com' } }))) as unknown as {
      body: { item: unknown }
    }
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', anilistId: 20, title: 'C' }),
      })
    )
    expect(res.body.item).toEqual(created)
  })

  it('stores note trimmed, null when empty string', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 3 })
    await POST(makeReq({ body: { anilistId: 30, title: 'D', note: '  ' } }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ note: null }) })
    )
  })

  it('returns 500 on DB create failure', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockRejectedValue(new Error('DB error'))
    const res = (await POST(makeReq({ body: { anilistId: 40, title: 'E' } }))) as unknown as { status: number }
    expect(res.status).toBe(500)
  })
})

// ─── PATCH ──────────────────────────────────────
describe('PATCH /api/onhold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'u1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await PATCH(makeReq({ body: { anilistId: 1, note: 'x' } }))) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await PATCH(makeReq({ body: { note: 'x' } }))) as unknown as { status: number }
    expect(res.status).toBe(400)
  })

  it('updates the note and returns the updated item', async () => {
    const updated = { id: 1, anilistId: 10, note: 'great' }
    mockUpdate.mockResolvedValue(updated)
    const res = (await PATCH(makeReq({ body: { anilistId: 10, note: 'great' } }))) as unknown as {
      body: { item: unknown }
    }
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { userId_anilistId: { userId: 'u1', anilistId: 10 } },
      data: { note: 'great' },
    })
    expect(res.body.item).toEqual(updated)
  })

  it('trims whitespace-only note to null', async () => {
    mockUpdate.mockResolvedValue({ id: 1, note: null })
    await PATCH(makeReq({ body: { anilistId: 10, note: '   ' } }))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { note: null } })
    )
  })

  it('returns 500 on DB update failure', async () => {
    mockUpdate.mockRejectedValue(new Error('DB error'))
    const res = (await PATCH(makeReq({ body: { anilistId: 10, note: 'x' } }))) as unknown as { status: number }
    expect(res.status).toBe(500)
  })
})

// ─── DELETE ─────────────────────────────────────
describe('DELETE /api/onhold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'u1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await DELETE(makeReq({ anilistId: 1 }))) as unknown as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns 400 when anilistId is missing', async () => {
    const res = (await DELETE(makeReq())) as unknown as { status: number }
    expect(res.status).toBe(400)
  })

  it('deletes item and returns ok: true', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })
    const res = (await DELETE(makeReq({ anilistId: 10 }))) as unknown as { body: { ok: boolean } }
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', anilistId: 10 } })
    expect(res.body.ok).toBe(true)
  })

  it('returns 500 on DB delete failure', async () => {
    mockDeleteMany.mockRejectedValue(new Error('DB error'))
    const res = (await DELETE(makeReq({ anilistId: 10 }))) as unknown as { status: number }
    expect(res.status).toBe(500)
  })
})
