/**
 * Tests for GET /api/admin/approve
 *
 * Scenarios:
 *  - Missing userId or token → "קישור לא תקין" HTML
 *  - ADMIN_SECRET not set → token verification fails → "אימות נכשל" HTML
 *  - Invalid token (tampered) → "אימות נכשל" HTML
 *  - User not found in DB → "משתמש לא נמצא" HTML
 *  - User already APPROVED → "כבר מאושר" HTML, no DB update
 *  - Valid token + PENDING user → updates to APPROVED, sends email, returns success HTML
 *  - Email send fails → still returns success HTML (error swallowed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

// ─── Hoist mocks ────────────────────────────────
const {
  mockFindUnique,
  mockUpdate,
  mockSendUserApprovedEmail,
  mockNextResponseCtor,
  mockNextResponseJson,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockSendUserApprovedEmail: vi.fn(),
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

vi.mock('@/lib/mailer', () => ({
  sendUserApprovedEmail: mockSendUserApprovedEmail,
}))

// ─── Import after mocks ──────────────────────────
import { GET } from '@/app/api/admin/approve/route'

// ─── Constants ──────────────────────────────────
const SECRET = 'test-admin-secret'
const USER_ID = 'clerk-user-123'

function validToken(userId = USER_ID) {
  return crypto.createHmac('sha256', SECRET).update(userId).digest('hex')
}

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/approve')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return { url: url.toString() } as Parameters<typeof GET>[0]
}

function htmlContains(fragment: string) {
  const calls = mockNextResponseCtor.mock.calls
  return calls.some(([html]: any[]) => (html as string).includes(fragment))
}

// ─── Tests ──────────────────────────────────────
describe('GET /api/admin/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_SECRET = SECRET
    mockSendUserApprovedEmail.mockResolvedValue(true)
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
    await GET(makeReq({ userId: USER_ID, token: 'invalid-token' }))
    expect(htmlContains('אימות נכשל')).toBe(true)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns "משתמש לא נמצא" HTML when user approval record does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    await GET(makeReq({ userId: USER_ID, token: validToken() }))
    expect(htmlContains('משתמש לא נמצא')).toBe(true)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns "כבר מאושר" HTML and does not update when already approved', async () => {
    mockFindUnique.mockResolvedValue({ clerkUserId: USER_ID, email: 'x@x.com', name: 'X', status: 'APPROVED' })
    await GET(makeReq({ userId: USER_ID, token: validToken() }))
    expect(htmlContains('כבר מאושר')).toBe(true)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockSendUserApprovedEmail).not.toHaveBeenCalled()
  })

  it('updates status to APPROVED, sends email, returns success HTML for PENDING user', async () => {
    mockFindUnique.mockResolvedValue({
      clerkUserId: USER_ID,
      email: 'user@example.com',
      name: 'Test User',
      status: 'PENDING',
    })

    await GET(makeReq({ userId: USER_ID, token: validToken() }))

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { clerkUserId: USER_ID },
      data: { status: 'APPROVED' },
    })
    expect(mockSendUserApprovedEmail).toHaveBeenCalledWith({
      userEmail: 'user@example.com',
      userName: 'Test User',
    })
    expect(htmlContains('גישה אושרה')).toBe(true)
  })

  it('still returns success HTML when email send throws', async () => {
    mockFindUnique.mockResolvedValue({
      clerkUserId: USER_ID,
      email: 'user@example.com',
      name: 'Test User',
      status: 'PENDING',
    })
    mockSendUserApprovedEmail.mockRejectedValue(new Error('SMTP error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await GET(makeReq({ userId: USER_ID, token: validToken() }))
    consoleSpy.mockRestore()

    expect(mockUpdate).toHaveBeenCalled()
    expect(htmlContains('גישה אושרה')).toBe(true)
  })
})
