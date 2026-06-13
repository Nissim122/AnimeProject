import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoist mocks ───────────────────────────────
const { mockSendMail, mockCreateTransport } = vi.hoisted(() => {
  const mockSendMail = vi.fn().mockResolvedValue({})
  const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }))
  return { mockSendMail, mockCreateTransport }
})

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
}))

// ─── Import after mocks ────────────────────────
import {
  isEmailConfigured,
  sendConsolidatedMonthlyEmail,
  sendUpdatesEmail,
  sendApprovalRequestEmail,
  sendUserApprovedEmail,
} from '@/lib/mailer'

// ─── Helpers ───────────────────────────────────
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

const FULL_ENV = {
  EMAIL_USER: 'test@example.com',
  EMAIL_PASS: 'secret',
  NOTIFY_EMAIL: 'notify@example.com',
}

const MONTH_ITEM = {
  hebrewTitle: 'נארוטו',
  englishTitle: 'Naruto',
  sequelTitle: 'Naruto Shippuden',
  coverImage: undefined,
  status: 'RELEASING' as const,
  nextAiringEpisode: null,
  sequelEpisodeCount: null,
  totalSeasons: 2,
  sequelId: 101,
  startDate: { year: 2024, month: 4, day: null },
  seasons: [],
}

// ─── isEmailConfigured ────────────────────────
describe('isEmailConfigured', () => {
  afterEach(() => {
    delete process.env.EMAIL_USER
    delete process.env.EMAIL_PASS
    delete process.env.NOTIFY_EMAIL
  })

  it('returns true when all three env vars are set', () => {
    setEnv(FULL_ENV)
    expect(isEmailConfigured()).toBe(true)
  })

  it('returns false when EMAIL_USER is missing', () => {
    setEnv({ ...FULL_ENV, EMAIL_USER: undefined })
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when EMAIL_PASS is missing', () => {
    setEnv({ ...FULL_ENV, EMAIL_PASS: undefined })
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when NOTIFY_EMAIL is missing', () => {
    setEnv({ ...FULL_ENV, NOTIFY_EMAIL: undefined })
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when all env vars are missing', () => {
    setEnv({ EMAIL_USER: undefined, EMAIL_PASS: undefined, NOTIFY_EMAIL: undefined })
    expect(isEmailConfigured()).toBe(false)
  })
})

// ─── sendConsolidatedMonthlyEmail ─────────────
describe('sendConsolidatedMonthlyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(FULL_ENV)
  })

  afterEach(() => {
    setEnv({ EMAIL_USER: undefined, EMAIL_PASS: undefined, NOTIFY_EMAIL: undefined })
  })

  it('sends the email and returns true when email is configured', async () => {
    const result = await sendConsolidatedMonthlyEmail({
      items: [MONTH_ITEM],
    })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(result).toBe(true)
  })

  it('returns false and skips send when EMAIL_USER is missing', async () => {
    setEnv({ EMAIL_USER: undefined })
    const result = await sendConsolidatedMonthlyEmail({ items: [MONTH_ITEM] })
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('returns false and skips send when EMAIL_PASS is missing', async () => {
    setEnv({ EMAIL_PASS: undefined })
    const result = await sendConsolidatedMonthlyEmail({ items: [MONTH_ITEM] })
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('uses the toEmail param when provided instead of NOTIFY_EMAIL', async () => {
    await sendConsolidatedMonthlyEmail({
      items: [MONTH_ITEM],
      toEmail: 'custom@example.com',
    })
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('custom@example.com')
  })

  it('falls back to NOTIFY_EMAIL when no toEmail is provided', async () => {
    await sendConsolidatedMonthlyEmail({ items: [MONTH_ITEM] })
    const call = mockSendMail.mock.calls[0][0]
    expect(call.to).toBe('notify@example.com')
  })

  it('returns false when NOTIFY_EMAIL is missing and no toEmail provided', async () => {
    setEnv({ NOTIFY_EMAIL: undefined })
    const result = await sendConsolidatedMonthlyEmail({ items: [MONTH_ITEM] })
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })
})

// ─── sendUpdatesEmail ─────────────────────────
describe('sendUpdatesEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(FULL_ENV)
  })

  afterEach(() => {
    setEnv({ EMAIL_USER: undefined, EMAIL_PASS: undefined, NOTIFY_EMAIL: undefined })
  })

  it('returns false and skips send when total items is zero', async () => {
    const result = await sendUpdatesEmail({
      watching: [],
      releasing: [],
      upcoming: [],
      toEmail: 'x@x.com',
    })
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('returns false when email config is missing', async () => {
    setEnv({ EMAIL_USER: undefined })
    const result = await sendUpdatesEmail({
      watching: [{ parentTitle: 'Naruto', sequelTitle: 'Shippuden' }],
      releasing: [],
      upcoming: [],
      toEmail: 'x@x.com',
    })
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('sends email and returns true when config present and total > 0', async () => {
    const result = await sendUpdatesEmail({
      watching: [{ parentTitle: 'Naruto', sequelTitle: 'Shippuden' }],
      releasing: [],
      upcoming: [],
      toEmail: 'x@x.com',
    })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(result).toBe(true)
  })
})

// ─── sendApprovalRequestEmail ─────────────────
describe('sendApprovalRequestEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(FULL_ENV)
  })

  afterEach(() => {
    setEnv({ EMAIL_USER: undefined, EMAIL_PASS: undefined, NOTIFY_EMAIL: undefined })
  })

  it('returns false when email transport is not configured', async () => {
    setEnv({ EMAIL_USER: undefined })
    const result = await sendApprovalRequestEmail({
      toAdmin: 'admin@example.com',
      userEmail: 'user@example.com',
      userName: 'User',
      adminUrl: 'http://localhost/admin',
    })
    expect(result).toBe(false)
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('sends email and returns true when configured', async () => {
    const result = await sendApprovalRequestEmail({
      toAdmin: 'admin@example.com',
      userEmail: 'user@example.com',
      userName: 'User',
      adminUrl: 'http://localhost/admin',
    })
    expect(result).toBe(true)
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('includes approve/deny buttons when URLs are provided', async () => {
    await sendApprovalRequestEmail({
      toAdmin: 'admin@example.com',
      userEmail: 'user@example.com',
      userName: 'User',
      adminUrl: 'http://localhost/admin',
      approveUrl: 'http://localhost/approve',
      denyUrl: 'http://localhost/deny',
    })
    const html = mockSendMail.mock.calls[0][0].html as string
    expect(html).toContain('http://localhost/approve')
    expect(html).toContain('http://localhost/deny')
  })
})

// ─── sendUserApprovedEmail ────────────────────
describe('sendUserApprovedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setEnv(FULL_ENV)
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL
  })

  afterEach(() => {
    setEnv({ EMAIL_USER: undefined, EMAIL_PASS: undefined, NOTIFY_EMAIL: undefined })
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  it('returns false when transport is not configured', async () => {
    setEnv({ EMAIL_USER: undefined })
    const result = await sendUserApprovedEmail({ userEmail: 'x@x.com', userName: 'X' })
    expect(result).toBe(false)
  })

  it('sends the email and returns true when configured', async () => {
    const result = await sendUserApprovedEmail({ userEmail: 'x@x.com', userName: 'X' })
    expect(result).toBe(true)
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('uses NEXT_PUBLIC_APP_URL when set', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://my-app.com'
    await sendUserApprovedEmail({ userEmail: 'x@x.com', userName: 'X' })
    const html = mockSendMail.mock.calls[0][0].html as string
    expect(html).toContain('https://my-app.com')
  })

  it('falls back to localhost when no env URL is set', async () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = undefined
    await sendUserApprovedEmail({ userEmail: 'x@x.com', userName: 'X' })
    const html = mockSendMail.mock.calls[0][0].html as string
    // In test env NODE_ENV is 'test', not 'production', so falls through to localhost
    expect(html).toContain('localhost:3000')
  })
})
