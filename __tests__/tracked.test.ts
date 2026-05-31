import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const { mockAuth, mockFindMany } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFindMany: vi.fn(),
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
    trackedAnime: { findMany: mockFindMany },
  },
}))

// ─── Import after mocks ────────────────────────
import { GET } from '@/app/api/tracked/route'

// ─── Tests ─────────────────────────────────────
describe('GET /api/tracked', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ userId: 'user-1' })
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = (await GET()) as { status: number }
    expect(res.status).toBe(401)
  })

  it('returns all tracked anime ordered by trackedAt desc', async () => {
    const tracked = [
      { id: 2, anilistId: 200, title: 'One Piece', trackedAt: new Date('2024-02-01') },
      { id: 1, anilistId: 100, title: 'Naruto', trackedAt: new Date('2024-01-01') },
    ]
    mockFindMany.mockResolvedValue(tracked)
    const res = (await GET()) as { body: { tracked: unknown[] } }
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { trackedAt: 'desc' },
    })
    expect(res.body.tracked).toHaveLength(2)
    expect(res.body.tracked).toBe(tracked)
  })

  it('returns an empty array when nothing is tracked', async () => {
    mockFindMany.mockResolvedValue([])
    const res = (await GET()) as { body: { tracked: unknown[] } }
    expect(res.body).toEqual({ tracked: [] })
  })

  it('returns 500 on DB failure', async () => {
    mockFindMany.mockRejectedValue(new Error('DB error'))
    const res = (await GET()) as { status: number }
    expect(res.status).toBe(500)
  })

  it('scopes query to the authenticated user only', async () => {
    mockFindMany.mockResolvedValue([])
    await GET()
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    )
  })
})
