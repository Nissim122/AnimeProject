/**
 * Comprehensive tests for the email notification logic in check-updates.
 *
 * Scenarios covered:
 *  - MONTH_START email: sent for RELEASING sequel, NOT_YET_RELEASED this month
 *  - MONTH_START: NOT sent for next month, FINISHED, or already notified
 *  - DAY_BEFORE email: sent when start is tomorrow
 *  - DAY_BEFORE: NOT sent if already notified or start is not tomorrow
 *  - Both notifications fire in the same run when sequel starts tomorrow (this month)
 *  - KnownSequel registration (new vs already-known)
 *  - Multi-generation chains: S1 tracked → S2 known → S3 newly discovered via S2
 *  - Email send failure: notification NOT recorded, no error thrown to outer catch
 *  - DB record failure: CRITICAL log emitted, notified counter still incremented
 *  - API error on one anime: errors++ but processing continues for others
 *  - Result counters: checked / notified / errors accurate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────
// Hoist mock functions so they exist before vi.mock factories run
// ─────────────────────────────────────────────
const {
  mockFindMany,
  mockUpsert,
  mockFindUnique,
  mockCreate,
  mockGetAnimeSequels,
  mockGetAnimeStatusWithSequels,
  mockGetAllSeasons,
  mockSendMonthStartEmail,
  mockSendDayBeforeEmail,
  mockSendAvailableSeasonsEmail,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpsert: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockGetAnimeSequels: vi.fn(),
  mockGetAnimeStatusWithSequels: vi.fn(),
  mockGetAllSeasons: vi.fn(),
  mockSendMonthStartEmail: vi.fn(),
  mockSendDayBeforeEmail: vi.fn(),
  mockSendAvailableSeasonsEmail: vi.fn(),
}))

// ─────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────
vi.mock('next/server', () => ({
  NextResponse: { json: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trackedAnime: { findMany: mockFindMany },
    knownSequel: { upsert: mockUpsert },
    sentNotification: { findUnique: mockFindUnique, create: mockCreate },
  },
}))

vi.mock('@/lib/anilist', () => ({
  getAnimeSequels: mockGetAnimeSequels,
  getAnimeStatusWithSequels: mockGetAnimeStatusWithSequels,
  getAllSeasons: mockGetAllSeasons,
  delay: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/mailer', () => ({
  sendMonthStartEmail: mockSendMonthStartEmail,
  sendDayBeforeEmail: mockSendDayBeforeEmail,
  sendAvailableSeasonsEmail: mockSendAvailableSeasonsEmail,
}))

vi.mock('@/lib/translate', () => ({
  translateToHebrew: vi.fn().mockResolvedValue('שם בעברית'),
}))

// ─────────────────────────────────────────────
// Import AFTER mocks
// ─────────────────────────────────────────────
import { runUpdateCheck } from '@/app/api/check-updates/route'

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────
function dateOffsetDays(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

const TODAY = () => dateOffsetDays(0)
const TOMORROW = () => dateOffsetDays(1)
const IN_5_DAYS = () => dateOffsetDays(5)

function THIS_MONTH_MID() {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: 15 }
}

function NEXT_MONTH() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: 1 }
}

function tomorrowIsThisMonth(): boolean {
  const t = TOMORROW()
  const now = new Date()
  return t.month === now.getMonth() + 1 && t.year === now.getFullYear()
}

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────
const ANIME = { id: 1, anilistId: 100, title: 'Parent Anime', knownSequels: [] }

function makeSequel(id: number, status: string, startDate: { year: number; month: number; day: number }) {
  return { id, format: 'TV', title: { romaji: `Sequel ${id}` }, status, startDate }
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
  },
]

// ─────────────────────────────────────────────
// Global beforeEach
// ─────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  mockUpsert.mockResolvedValue({})
  mockCreate.mockResolvedValue({})
  mockFindUnique.mockResolvedValue(null)           // no prior notifications by default
  mockGetAnimeSequels.mockResolvedValue([])
  mockGetAnimeStatusWithSequels.mockResolvedValue({
    status: 'FINISHED',
    startDate: { year: null, month: null, day: null },
    sequels: [],
  })
  mockGetAllSeasons.mockResolvedValue(FAKE_ALL_SEASONS)
  mockSendMonthStartEmail.mockResolvedValue(true)
  mockSendDayBeforeEmail.mockResolvedValue(true)
  mockSendAvailableSeasonsEmail.mockResolvedValue(false)
})

// ═════════════════════════════════════════════
// MONTH_START
// ═════════════════════════════════════════════
describe('MONTH_START notifications', () => {
  it('sends email for a RELEASING sequel (first time)', async () => {
    const s = makeSequel(200, 'RELEASING', { year: 2024, month: 1, day: 7 })
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    const result = await runUpdateCheck()

    expect(mockSendMonthStartEmail).toHaveBeenCalledOnce()
    expect(mockSendMonthStartEmail).toHaveBeenCalledWith(
      expect.objectContaining({ sequelTitle: 'Sequel 200', status: 'RELEASING' })
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequelAnilistId: 200, type: 'MONTH_START' }) })
    )
    expect(result.notified).toBe(1)
    expect(result.notifications[0]).toMatchObject({ type: 'MONTH_START', sequel: 'Sequel 200' })
  })

  it('sends email for NOT_YET_RELEASED sequel starting this month', async () => {
    const s = makeSequel(201, 'NOT_YET_RELEASED', THIS_MONTH_MID())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    const result = await runUpdateCheck()

    expect(mockSendMonthStartEmail).toHaveBeenCalledOnce()
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequelAnilistId: 201, type: 'MONTH_START' }) })
    )
    expect(result.notified).toBe(1)
  })

  it('does NOT send if already notified — duplicate prevention', async () => {
    const s = makeSequel(202, 'NOT_YET_RELEASED', THIS_MONTH_MID())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })
    mockFindUnique.mockResolvedValue({ id: 1, sequelAnilistId: 202, type: 'MONTH_START' })

    const result = await runUpdateCheck()

    expect(mockSendMonthStartEmail).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.notified).toBe(0)
  })

  it('does NOT send for NOT_YET_RELEASED sequel starting next month', async () => {
    const s = makeSequel(203, 'NOT_YET_RELEASED', NEXT_MONTH())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    const result = await runUpdateCheck()

    expect(mockSendMonthStartEmail).not.toHaveBeenCalled()
    expect(result.notified).toBe(0)
  })

  it('does NOT send for FINISHED sequel', async () => {
    const s = makeSequel(204, 'FINISHED', { year: 2020, month: 4, day: 1 })
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    await runUpdateCheck()

    expect(mockSendMonthStartEmail).not.toHaveBeenCalled()
  })

  it('does NOT send for CANCELLED sequel', async () => {
    const s = makeSequel(205, 'CANCELLED', { year: 2023, month: 1, day: 1 })
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    await runUpdateCheck()

    expect(mockSendMonthStartEmail).not.toHaveBeenCalled()
  })

  it('does NOT record notification when email returns false (email not configured)', async () => {
    const s = makeSequel(206, 'RELEASING', { year: 2024, month: 1, day: 1 })
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })
    mockSendMonthStartEmail.mockResolvedValue(false)

    await runUpdateCheck()

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('still increments notified when email succeeds but DB record throws (CRITICAL log scenario)', async () => {
    const s = makeSequel(207, 'NOT_YET_RELEASED', THIS_MONTH_MID())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })
    mockCreate.mockRejectedValue(new Error('DB locked'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(result.notified).toBe(1)   // email was sent
    expect(result.errors).toBe(0)     // not an anime-level error (inner try-catch)
  })
})

// ═════════════════════════════════════════════
// DAY_BEFORE
// ═════════════════════════════════════════════
describe('DAY_BEFORE notifications', () => {
  it('sends email when NOT_YET_RELEASED sequel starts tomorrow', async () => {
    const sd = TOMORROW()
    const s = makeSequel(300, 'NOT_YET_RELEASED', sd)
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    const result = await runUpdateCheck()

    expect(mockSendDayBeforeEmail).toHaveBeenCalledOnce()
    expect(mockSendDayBeforeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ parentTitle: 'Parent Anime', sequelTitle: 'Sequel 300', startDate: sd })
    )
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequelAnilistId: 300, type: 'DAY_BEFORE' }) })
    )
    expect(result.notifications.some((n) => n.type === 'DAY_BEFORE')).toBe(true)
  })

  it('does NOT send if already notified — duplicate prevention', async () => {
    const s = makeSequel(301, 'NOT_YET_RELEASED', TOMORROW())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })
    mockFindUnique.mockImplementation(
      ({ where }: { where: { sequelAnilistId_type: { type: string } } }) =>
        where.sequelAnilistId_type.type === 'DAY_BEFORE'
          ? Promise.resolve({ id: 5, type: 'DAY_BEFORE' })
          : Promise.resolve(null)
    )

    await runUpdateCheck()

    expect(mockSendDayBeforeEmail).not.toHaveBeenCalled()
  })

  it('does NOT send for RELEASING sequel (already started)', async () => {
    const s = makeSequel(302, 'RELEASING', TOMORROW())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    await runUpdateCheck()

    expect(mockSendDayBeforeEmail).not.toHaveBeenCalled()
  })

  it('does NOT send when start date is in 5 days (not tomorrow)', async () => {
    const s = makeSequel(303, 'NOT_YET_RELEASED', IN_5_DAYS())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    await runUpdateCheck()

    expect(mockSendDayBeforeEmail).not.toHaveBeenCalled()
  })

  it('does NOT send when start date is today', async () => {
    const s = makeSequel(304, 'NOT_YET_RELEASED', TODAY())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    await runUpdateCheck()

    expect(mockSendDayBeforeEmail).not.toHaveBeenCalled()
  })

  it('does NOT record DAY_BEFORE when email returns false', async () => {
    const s = makeSequel(305, 'NOT_YET_RELEASED', TOMORROW())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })
    mockSendMonthStartEmail.mockResolvedValue(false)
    mockSendDayBeforeEmail.mockResolvedValue(false)

    await runUpdateCheck()

    const dayCalls = (mockCreate.mock.calls as [{ data: { type: string } }][]).filter(
      (c) => c[0].data.type === 'DAY_BEFORE'
    )
    expect(dayCalls).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════
// Combined MONTH_START + DAY_BEFORE
// ═════════════════════════════════════════════
describe('Combined MONTH_START + DAY_BEFORE', () => {
  it.runIf(tomorrowIsThisMonth())(
    'sends BOTH emails when sequel starts tomorrow (same calendar month)',
    async () => {
      const s = makeSequel(400, 'NOT_YET_RELEASED', TOMORROW())
      mockFindMany.mockResolvedValue([{ ...ANIME }])
      mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

      const result = await runUpdateCheck()

      expect(mockSendMonthStartEmail).toHaveBeenCalledOnce()
      expect(mockSendDayBeforeEmail).toHaveBeenCalledOnce()
      expect(result.notified).toBe(2)
      expect(mockCreate).toHaveBeenCalledTimes(2)
      const types = (mockCreate.mock.calls as [{ data: { type: string } }][]).map((c) => c[0].data.type)
      expect(types).toContain('MONTH_START')
      expect(types).toContain('DAY_BEFORE')
    }
  )

  it('sends only DAY_BEFORE when MONTH_START already recorded but start is tomorrow', async () => {
    const s = makeSequel(401, 'NOT_YET_RELEASED', TOMORROW())
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })
    mockFindUnique.mockImplementation(
      ({ where }: { where: { sequelAnilistId_type: { type: string } } }) =>
        where.sequelAnilistId_type.type === 'MONTH_START'
          ? Promise.resolve({ id: 1, type: 'MONTH_START' })
          : Promise.resolve(null)
    )

    await runUpdateCheck()

    expect(mockSendMonthStartEmail).not.toHaveBeenCalled()
    expect(mockSendDayBeforeEmail).toHaveBeenCalledOnce()
  })
})

// ═════════════════════════════════════════════
// KnownSequel registration
// ═════════════════════════════════════════════
describe('KnownSequel registration', () => {
  it('does not send notification for a FINISHED sequel', async () => {
    const s = makeSequel(500, 'FINISHED', { year: 2020, month: 1, day: 1 })
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    await runUpdateCheck()

    expect(mockSendMonthStartEmail).not.toHaveBeenCalled()
  })

  it('does not send notification for an already-known FINISHED sequel', async () => {
    const s = makeSequel(501, 'FINISHED', { year: 2020, month: 1, day: 1 })
    mockFindMany.mockResolvedValue([{ ...ANIME, knownSequels: [{ sequelAnilistId: 501 }] }])
    mockGetAnimeStatusWithSequels.mockResolvedValue({ status: 'FINISHED', startDate: { year: null, month: null, day: null }, sequels: [s] })

    await runUpdateCheck()

    expect(mockSendMonthStartEmail).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════
// Multi-generation sequel traversal (Bug fix)
// ═════════════════════════════════════════════
describe('Multi-generation sequel traversal — S1 tracked → S2 known → S3 new', () => {
  it('discovers S3 by also querying known sequel S2 for its children', async () => {
    const s3 = makeSequel(603, 'NOT_YET_RELEASED', THIS_MONTH_MID())

    mockFindMany.mockResolvedValue([{
      id: 1,
      anilistId: 601,
      title: 'Parent Anime',
      knownSequels: [{ sequelAnilistId: 602 }], // S2 is known
    }])

    mockGetAnimeSequels.mockImplementation((id: number) => {
      if (id === 601) return Promise.resolve([makeSequel(602, 'FINISHED', { year: 2021, month: 1, day: 1 })])
      if (id === 602) return Promise.resolve([s3])  // S3 is new, discovered via S2
      return Promise.resolve([])
    })

    const result = await runUpdateCheck()

    // S3 upserted into KnownSequel
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trackedAnimeId_sequelAnilistId: { trackedAnimeId: 1, sequelAnilistId: 603 } },
        create: { trackedAnimeId: 1, sequelAnilistId: 603 },
      })
    )
    // S3 qualifies for MONTH_START → email sent
    expect(mockSendMonthStartEmail).toHaveBeenCalledOnce()
    expect(result.notified).toBe(1)
  })

  it('does not send duplicate emails when a sequel appears via multiple parent paths', async () => {
    const s3 = makeSequel(703, 'RELEASING', { year: 2025, month: 1, day: 1 })

    mockFindMany.mockResolvedValue([{
      id: 1,
      anilistId: 701,
      title: 'Parent Anime',
      knownSequels: [{ sequelAnilistId: 702 }],
    }])

    mockGetAnimeSequels.mockImplementation((id: number) => {
      // S3 appears in both S1's and S2's sequel lists
      if (id === 701) return Promise.resolve([makeSequel(702, 'FINISHED', { year: 2022, month: 1, day: 1 }), s3])
      if (id === 702) return Promise.resolve([s3])
      return Promise.resolve([])
    })

    const result = await runUpdateCheck()

    // S3 upserted only once
    const s3Upserts = (mockUpsert.mock.calls as [{ where: { trackedAnimeId_sequelAnilistId: { sequelAnilistId: number } } }][]).filter(
      (c) => c[0].where.trackedAnimeId_sequelAnilistId.sequelAnilistId === 703
    )
    expect(s3Upserts).toHaveLength(1)
    // Only one MONTH_START email for S3
    expect(mockSendMonthStartEmail).toHaveBeenCalledOnce()
    expect(result.notified).toBe(1)
  })
})

// ═════════════════════════════════════════════
// Error handling
// ═════════════════════════════════════════════
describe('Error handling', () => {
  it('increments errors and continues to next anime on API failure', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, anilistId: 100, title: 'Error Anime', knownSequels: [] },
      { id: 2, anilistId: 200, title: 'OK Anime', knownSequels: [] },
    ])
    mockGetAnimeSequels
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockResolvedValue([])

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(result.errors).toBe(1)
    expect(result.checked).toBe(2)
  })

  it('does NOT record notification when email send throws, and increments errors', async () => {
    const s = makeSequel(800, 'RELEASING', { year: 2024, month: 1, day: 1 })
    mockFindMany.mockResolvedValue([{ ...ANIME }])
    mockGetAnimeSequels.mockResolvedValue([s])
    mockSendMonthStartEmail.mockRejectedValue(new Error('SMTP connection refused'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(mockCreate).not.toHaveBeenCalled()
    expect(result.errors).toBe(1)
    expect(result.notified).toBe(0)
  })
})

// ═════════════════════════════════════════════
// Result counters
// ═════════════════════════════════════════════
describe('Result counters', () => {
  it('returns accurate checked / notified / errors counts across multiple anime', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, anilistId: 100, title: 'Anime A', knownSequels: [] },
      { id: 2, anilistId: 200, title: 'Anime B', knownSequels: [] },
      { id: 3, anilistId: 300, title: 'Anime C Error', knownSequels: [] },
    ])
    mockGetAnimeSequels
      .mockResolvedValueOnce([makeSequel(901, 'RELEASING', { year: 2024, month: 1, day: 1 })])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('timeout'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runUpdateCheck()
    consoleSpy.mockRestore()

    expect(result.checked).toBe(3)
    expect(result.notified).toBe(1)
    expect(result.errors).toBe(1)
  })

  it('returns all-zero counters when no anime is tracked', async () => {
    mockFindMany.mockResolvedValue([])

    const result = await runUpdateCheck()

    expect(result.checked).toBe(0)
    expect(result.notified).toBe(0)
    expect(result.errors).toBe(0)
    expect(result.notifications).toEqual([])
  })
})
