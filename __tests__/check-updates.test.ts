/**
 * Tests for the consolidated email notification logic in check-updates.
 *
 * Scenarios covered:
 *  - Consolidated email sent for RELEASING sequel (first time)
 *  - Consolidated email NOT sent if already notified (duplicate prevention)
 *  - No email for FINISHED / CANCELLED sequels
 *  - FINISHED untracked sequels appear in the available section
 *  - Tracked anime itself RELEASING triggers notification
 *  - Multi-generation chains: S1 tracked → S2 known → S3 newly discovered via S2
 *  - Deduplication: sequel appearing via multiple paths sends only one notification
 *  - Email send failure: notifications NOT recorded, errors++
 *  - DB record failure: CRITICAL log emitted, notified counter still incremented
 *  - User with no email is skipped gracefully
 *  - API error on one anime: errors++ but processing continues for others
 *  - Result counters: checked / notified / errors accurate
 *  - No email sent when nothing to report
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────
// Hoist mock functions so they exist before vi.mock factories run
// ─────────────────────────────────────────────
const {
  mockFindMany,
  mockSentNotificationFindMany,
  mockCreateMany,
  mockGetAnimeSequels,
  mockGetAnimeStatusWithSequels,
  mockGetAllSeasons,
  mockSendConsolidatedMonthlyEmail,
  mockGetUser,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockSentNotificationFindMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockGetAnimeSequels: vi.fn(),
  mockGetAnimeStatusWithSequels: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockSendConsolidatedMonthlyEmail: vi.fn(),
  mockGetUser: vi.fn(),
}))

// ─────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────
vi.mock('next/server', () => ({
  NextResponse: { json: vi.fn() },
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'test-user' }),
  clerkClient: vi.fn().mockResolvedValue({
    users: { getUser: mockGetUser },
  }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trackedAnime: { findMany: mockFindMany },
    sentNotification: { findMany: mockSentNotificationFindMany, createMany: mockCreateMany },
  },
}))

vi.mock('@/lib/anilist', () => ({
  getAnimeSequels: mockGetAnimeSequels,
  getAnimeStatusWithSequels: mockGetAnimeStatusWithSequels,
  getAllSeasons: mockGetAllSeasons,
  delay: vi.fn().mockResolvedValue(undefined),
  withRateLimit: vi.fn().mockImplementation((fn: () => unknown) => fn()),
}))

vi.mock('@/lib/mailer', () => ({
  sendConsolidatedMonthlyEmail: mockSendConsolidatedMonthlyEmail,
}))

vi.mock('@/lib/translate', () => ({
  translateToHebrew: vi.fn().mockResolvedValue('שם בעברית'),
}))

// ─────────────────────────────────────────────
// Import AFTER mocks
// ─────────────────────────────────────────────
import { runUpdateCheck } from '@/app/api/check-updates/route'

// ─────────────────────────────────────────────
// Constants & fixtures
// ─────────────────────────────────────────────
const USER_ID = 'test-user'
const USER_EMAIL = 'test@example.com'

const BASE_ANIME = {
  id: 1,
  anilistId: 100,
  title: 'Parent Anime',
  coverImage: null,
  userId: USER_ID,
  knownSequels: [],
}

function makeSequel(id: number, status: string) {
  return {
    id,
    format: 'TV',
    title: { romaji: `Sequel ${id}` },
    status,
    startDate: { year: 2024, month: 1, day: 1 },
  }
}

const FAKE_ALL_SEASONS = [
  {
    id: 100,
    title: { english: 'Parent Anime', romaji: 'Parent Anime' },
    coverImage: { large: '' },
    status: 'FINISHED',
    seasonYear: 2020,
    season: 'WINTER',
    format: 'TV',
    popularity: 100,
    episodes: 12,
    nextAiringEpisode: null,
  },
]

// ─────────────────────────────────────────────
// Helper: configure findMany for both call shapes
//   1st shape: { select: { userId: true }, distinct: [...] } → returns userId list
//   2nd shape: { where: { userId }, include: { knownSequels: true } } → returns animes
// ─────────────────────────────────────────────
function setupTracked(animes: object[]) {
  mockFindMany.mockImplementation(
    async (args: { select?: { userId?: unknown }; where?: unknown }) => {
      if (args?.select?.userId !== undefined) {
        return animes.length > 0 ? [{ userId: USER_ID }] : []
      }
      return animes
    },
  )
}

// ─────────────────────────────────────────────
// Global beforeEach
// ─────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  setupTracked([])
  mockGetUser.mockResolvedValue({
    emailAddresses: [{ id: 'em1', emailAddress: USER_EMAIL }],
    primaryEmailAddressId: 'em1',
  })
  mockSentNotificationFindMany.mockResolvedValue([])
  mockCreateMany.mockResolvedValue({ count: 0 })
  mockGetAnimeSequels.mockResolvedValue([])
  mockGetAnimeStatusWithSequels.mockResolvedValue({
    status: 'FINISHED',
    startDate: { year: null, month: null, day: null },
    sequels: [],
  })
  mockGetAllSeasons.mockResolvedValue(FAKE_ALL_SEASONS)
  mockSendConsolidatedMonthlyEmail.mockResolvedValue(true)
})

// ═════════════════════════════════════════════
// RELEASING sequel → consolidated email
// ═════════════════════════════════════════════
describe('Consolidated email — RELEASING sequel', () => {
  it('sends consolidated email for a RELEASING sequel (first time)', async () => {
    const s = makeSequel(200, 'RELEASING')
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [s],
    })

    const result = await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).toHaveBeenCalledOnce()
    expect(mockSendConsolidatedMonthlyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ sequelTitle: 'Sequel 200', status: 'RELEASING' }),
        ]),
        toEmail: USER_EMAIL,
      }),
    )
    expect(mockCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            sequelAnilistId: 200,
            type: 'MONTH_START',
            userId: USER_ID,
          }),
        ]),
        skipDuplicates: true,
      }),
    )
    expect(result.notified).toBe(1)
  })

  it('does NOT send if already notified — duplicate prevention', async () => {
    const s = makeSequel(201, 'RELEASING')
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [s],
    })
    mockSentNotificationFindMany.mockResolvedValue([{ sequelAnilistId: 201, type: 'MONTH_START' }])

    const result = await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).not.toHaveBeenCalled()
    expect(result.notified).toBe(0)
  })

  it('does NOT include FINISHED sequel as a notification item', async () => {
    // FINISHED sequels appear in the available section, not as notification items.
    // Add the sequel to tracked so it doesn't appear in available either → no email.
    const finishedId = 202
    setupTracked([
      { ...BASE_ANIME },
      { id: 2, anilistId: finishedId, title: 'Sequel 202', coverImage: null, userId: USER_ID, knownSequels: [] },
    ])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(finishedId, 'FINISHED')],
    })

    await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).not.toHaveBeenCalled()
    expect(mockCreateMany).not.toHaveBeenCalled()
  })

  it('does NOT include CANCELLED sequel as a notification item', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(203, 'CANCELLED')],
    })

    await runUpdateCheck()

    // No items, no notification records
    expect(mockCreateMany).not.toHaveBeenCalled()
    if (mockSendConsolidatedMonthlyEmail.mock.calls.length > 0) {
      const items = mockSendConsolidatedMonthlyEmail.mock.calls[0][0].items
      expect(items).toHaveLength(0)
    }
  })

  it('sends when the tracked anime itself is RELEASING', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'RELEASING',
      startDate: { year: 2024, month: 1, day: 1 },
      sequels: [],
    })

    const result = await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).toHaveBeenCalledOnce()
    expect(result.notified).toBe(1)
  })

  it('does NOT record notification when email returns false (email not configured)', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(204, 'RELEASING')],
    })
    mockSendConsolidatedMonthlyEmail.mockResolvedValue(false)

    const result = await runUpdateCheck()

    expect(mockCreateMany).not.toHaveBeenCalled()
    expect(result.notified).toBe(0)
  })

  it('still increments notified when email succeeds but DB record throws (CRITICAL log scenario)', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHING',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(205, 'RELEASING')],
    })
    mockCreateMany.mockRejectedValue(new Error('DB locked'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(result.notified).toBe(1)
    expect(result.errors).toBe(0)
  })
})

// ═════════════════════════════════════════════
// Available (FINISHED, untracked) in consolidated email
// ═════════════════════════════════════════════
describe('Available seasons in consolidated email', () => {
  it('includes FINISHED untracked sequels in the available section', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(300, 'FINISHED')],
    })

    await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).toHaveBeenCalledOnce()
    expect(mockSendConsolidatedMonthlyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        available: expect.arrayContaining([
          expect.objectContaining({ sequelTitle: 'Sequel 300' }),
        ]),
      }),
    )
    expect(mockCreateMany).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════
// Multi-generation sequel traversal
// ═════════════════════════════════════════════
describe('Multi-generation sequel traversal — S1 tracked → S2 known → S3 new', () => {
  it('discovers S3 by querying known sequel S2 for its children', async () => {
    const s3 = makeSequel(603, 'RELEASING')

    setupTracked([{
      id: 1,
      anilistId: 601,
      title: 'Parent Anime',
      coverImage: null,
      userId: USER_ID,
      knownSequels: [{ sequelAnilistId: 602 }],
    }])

    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(602, 'FINISHED')],
    })
    mockGetAnimeSequels.mockImplementation((id: number) => {
      if (id === 602) return Promise.resolve([s3])
      return Promise.resolve([])
    })

    const result = await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).toHaveBeenCalledOnce()
    expect(result.notified).toBe(1)
  })

  it('does not send duplicate notifications when sequel appears via multiple paths', async () => {
    const s3 = makeSequel(703, 'RELEASING')

    setupTracked([{
      id: 1,
      anilistId: 701,
      title: 'Parent Anime',
      coverImage: null,
      userId: USER_ID,
      knownSequels: [{ sequelAnilistId: 702 }],
    }])

    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(702, 'FINISHED'), s3],
    })
    mockGetAnimeSequels.mockImplementation((id: number) => {
      if (id === 702) return Promise.resolve([s3])
      return Promise.resolve([])
    })

    const result = await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).toHaveBeenCalledOnce()
    const items = mockSendConsolidatedMonthlyEmail.mock.calls[0][0].items
    expect(items).toHaveLength(1)
    expect(result.notified).toBe(1)
  })
})

// ═════════════════════════════════════════════
// Error handling
// ═════════════════════════════════════════════
describe('Error handling', () => {
  it('increments errors and continues to next anime on API failure', async () => {
    // Anime 100 always throws (both retry attempts) → counted as error.
    // Anime 200 succeeds normally.
    setupTracked([
      { id: 1, anilistId: 100, title: 'Error Anime', coverImage: null, userId: USER_ID, knownSequels: [] },
      { id: 2, anilistId: 200, title: 'OK Anime', coverImage: null, userId: USER_ID, knownSequels: [] },
    ])
    mockGetAnimeStatusWithSequels.mockImplementation(async (id: number) => {
      if (id === 100) throw new Error('Rate limited')
      return { status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [] }
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(result.errors).toBe(1)
    expect(result.checked).toBe(2)
  })

  it('does NOT record notifications when email send throws, and increments errors', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [makeSequel(800, 'RELEASING')],
    })
    mockSendConsolidatedMonthlyEmail.mockRejectedValue(new Error('SMTP connection refused'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(mockCreateMany).not.toHaveBeenCalled()
    expect(result.errors).toBe(1)
    expect(result.notified).toBe(0)
  })

  it('skips user with no email address without throwing', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetUser.mockResolvedValue({
      emailAddresses: [],
      primaryEmailAddressId: null,
    })

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(mockSendConsolidatedMonthlyEmail).not.toHaveBeenCalled()
    expect(result.notified).toBe(0)
  })
})

// ═════════════════════════════════════════════
// Result counters
// ═════════════════════════════════════════════
describe('Result counters', () => {
  it('returns accurate checked / notified / errors counts across multiple anime', async () => {
    // Anime 300 always throws (both retry attempts) → errors++.
    setupTracked([
      { id: 1, anilistId: 100, title: 'Anime A', coverImage: null, userId: USER_ID, knownSequels: [] },
      { id: 2, anilistId: 200, title: 'Anime B', coverImage: null, userId: USER_ID, knownSequels: [] },
      { id: 3, anilistId: 300, title: 'Anime C Error', coverImage: null, userId: USER_ID, knownSequels: [] },
    ])
    mockGetAnimeStatusWithSequels.mockImplementation(async (id: number) => {
      if (id === 300) throw new Error('timeout')
      if (id === 100) return { status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [makeSequel(901, 'RELEASING')] }
      return { status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [] }
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(result.checked).toBe(3)
    expect(result.notified).toBe(1)
    expect(result.errors).toBe(1)
  })

  it('returns all-zero counters when no anime is tracked', async () => {
    setupTracked([])

    const result = await runUpdateCheck()

    expect(result.checked).toBe(0)
    expect(result.notified).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.notifications).toEqual([])
  })

  it('no email sent when tracked anime has no RELEASING sequels and no available', async () => {
    setupTracked([{ ...BASE_ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({
      status: 'FINISHED',
      startDate: { year: null, month: null, day: null },
      sequels: [],
    })

    const result = await runUpdateCheck()

    expect(mockSendConsolidatedMonthlyEmail).not.toHaveBeenCalled()
    expect(result.notified).toBe(0)
  })
})
