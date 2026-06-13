/**
 * Tests for GET /api/admin/deny
 *
 * Scenarios:
 *  - Missing userId or token → "קישור לא תקין" HTML
 *  - ADMIN_SECRET not set → token verification fails → "אימות נכשל" HTML
 *  - Invalid token → "אימות נכשל" HTML
 *  - User not found in DB → "משתמש לא נמצא" HTML
 *  - User already DENIED → "כבר נדחה" HTML, no update
 *  - User already APPROVED → "לא ניתן לדחות" HTML, no update
 *  - Valid token + PENDING user → updates to DENIED, returns denial HTML
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

// ─── Hoist mocks ────────────────────────────────
const {
  mockFindUnique,
  mockUpdate,
  mockNextResponseCtor,
  mockNextResponseJson,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockNextResponseCtor: vi.fn(),
  mockNextResponseJson: vi.fn((body: unknown, init?: { status?: number }) => ({
    body,
    status: init?.status ?? 200,
  })),
}))

vi.mock('next/server', () => {
  const NR = function (html: string, init?: unknown) {
    mockNextResponseCtor(html, init)
    return { _html: html }
  }
  NR.json = mockNextResponseJson
  return { NextResponse: NR, NextRequest: class {} }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userApproval: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}))

// ─── Import after mocks ──────────────────────────
import { GET } from '@/app/api/admin/deny/route'

// ─── Constants ──────────────────────────────────
const SECRET = 'test-admin-secret'
const USER_ID = 'clerk-user-456'

function validToken(userId = USER_ID) {
  return crypto.createHmac('sha256', SECRET).update(userId).digest('hex')
}

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/deny')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return { url: url.toString() } as Parameters<typeof GET>[0]
}

function htmlContains(fragment: string) {
  return mockNextResponseCtor.mock.calls.some(([html]: any[]) => (html as string).includes(fragment))
}

// ─── Tests ──────────────────────────────────────
describe('GET /api/admin/deny', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_SECRET = SECRET
    mockUpdate.mockResolvedValue({})
  })

  afterEach(() => {
    delete process.env.ADMIN_SECRET
  })

  it('returns "קישור לא תקין" HTML when userId is missing', async () => {
    await GET(makeReq({ token: validToken() }))
    expect(htmlContains('קישור לא תקין')).toBe(true)
  })

  it('returns "קישור לא תקין" HTML when token is missing', async () => {
    await GET(makeReq({ userId: USER_ID }))
    expect(htmlContains('קישור לא תקין')).toBe(true)
  })

  it('returns "אימות נכשל" HTML when ADMIN_SECRET is not set', async () => {
    delete process.env.ADMIN_SECRET
    await GET(makeReq({ userId: USER_ID, token: validToken() }))
    expect(htmlContains('אימות נכשל')).toBe(true)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns "אימות נכשל" HTML when token is tampered', async () => {
    await GET(makeReq({ userId: USER_ID, token: 'wrong-token' }))
    expect(htmlContains('אימות נכשל')).toBe(true)
  })

  it('returns "משתמש לא נמצא" HTML when user record does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    await GET(makeReq({ userId: USER_ID, token: validToken() }))
    expect(htmlContains('משתמש לא נמצא')).toBe(true)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns "כבר נדחה" HTML and does not update when already denied', async () => {
    mockFindUnique.mockResolvedValue({ clerkUserId: USER_ID, email: 'x@x.com', name: 'X', status: 'DENIED' })
    await GET(makeReq({ userId: USER_ID, token: validToken() }))
    expect(htmlContains('כבר נדחה')).toBe(true)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns "לא ניתן לדחות" HTML and does not update when already approved', async () => {
    mockFindUnique.mockResolvedValue({ clerkUserId: USER_ID, email: 'x@x.com', name: 'X', status: 'APPROVED' })
    await GET(makeReq({ userId: USER_ID, token: validToken() }))
    expect(htmlContains('לא ניתן לדחות')).toBe(true)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('updates status to DENIED and returns denial HTML for PENDING user', async () => {
    mockFindUnique.mockResolvedValue({
      clerkUserId: USER_ID,
      email: 'pending@example.com',
      name: 'Pending User',
      status: 'PENDING',
    })

    await GET(makeReq({ userId: USER_ID, token: validToken() }))

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { clerkUserId: USER_ID },
      data: { status: 'DENIED' },
    })
    expect(htmlContains('בקשה נדחתה')).toBe(true)
  })

  it('denial HTML does not contain approval language', async () => {
    mockFindUnique.mockResolvedValue({
      clerkUserId: USER_ID,
      email: 'pending@example.com',
      name: 'Pending User',
      status: 'PENDING',
    })

    await GET(makeReq({ userId: USER_ID, token: validToken() }))

    expect(htmlContains('גישה אושרה')).toBe(false)
  })
})
