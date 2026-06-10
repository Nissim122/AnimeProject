/**
 * Tests for check-episode-releases route.
 *
 * Scenarios:
 *  - No episodes aired → returns 0 notified
 *  - Aired episode for tracked anime → email sent, notification recorded
 *  - Aired episode for known sequel → email sent (parent cover used)
 *  - Already notified episode → no duplicate email
 *  - Multiple users → each gets their own email
 *  - User with no email → skipped gracefully
 *  - AniList range query returns episodes not matching any user → no email
 *  - Email send failure → errors++, notification NOT recorded
 *  - Upcoming episodes included in email payload
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoist mock functions ───────────────────────
const {
  mockFindMany,
  mockFindUnique,
  mockCreate,
  mockGetAiringScheduleInRange,
  mockGetAnimeAiringSchedule,
  mockWithRateLimit,
  mockSendNewEpisodeEmail,
  mockGetUser,
} = vi.hoisted(() => ({
  mockFindMany:                   vi.fn(),
  mockFindUnique:                 vi.fn(),
  mockCreate:                     vi.fn(),
  mockGetAiringScheduleInRange:   vi.fn(),
  mockGetAnimeAiringSchedule:     vi.fn(),
  mockWithRateLimit:              vi.fn(),
  mockSendNewEpisodeEmail:        vi.fn(),
  mockGetUser:                    vi.fn(),
}))

// ─── Module mocks ────────────────────────────────
vi.mock('next/server', () => ({
  NextResponse: { json: vi.fn((body: unknown) => ({ json: async () => body, _body: body })) },
}))

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn().mockResolvedValue({ users: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trackedAnime:     { findMany: mockFindMany },
    sentNotification: { findUnique: mockFindUnique, create: mockCreate },
  },
}))

vi.mock('@/lib/anilist', () => ({
  getAiringScheduleInRange: mockGetAiringScheduleInRange,
  getAnimeAiringSchedule:   mockGetAnimeAiringSchedule,
  withRateLimit:            mockWithRateLimit,
}))

vi.mock('@/lib/mailer', () => ({
  sendNewEpisodeEmail: mockSendNewEpisodeEmail,
}))

// ─── Import after mocks ──────────────────────────
import { GET } from '@/app/api/check-episode-releases/route'

// ─── Helpers ────────────────────────────────────
const NOW = Math.floor(Date.now() / 1000)

function makeAiredEntry(mediaId: number, episode: number, title = `Anime ${mediaId}`) {
  return { mediaId, episode, airingAt: NOW - 3600, title, coverImage: `https://cdn.example.com/${mediaId}.jpg` }
}

function makeTracked(userId: string, anilistId: number, title = `Anime ${anilistId}`) {
  return { userId, anilistId, title, coverImage: `https://cdn.example.com/${anilistId}.jpg`, knownSequels: [] }
}

function makeUser(email = 'test@example.com') {
  return {
    emailAddresses: [{ id: 'ea1', emailAddress: email }],
    primaryEmailAddressId: 'ea1',
  }
}

describe('GET /api/check-episode-releases', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockWithRateLimit.mockImplementation((fn: () => unknown) => fn())
    mockCreate.mockResolvedValue({})
    mockGetAnimeAiringSchedule.mockResolvedValue({ nextAiringEpisode: null, upcoming: [] })
    mockSendNewEpisodeEmail.mockResolvedValue(true)
  })

  it('returns 0 notified when no episodes aired', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([])
    mockFindMany.mockResolvedValue([])

    const res = await GET()
    const body = (res as any)._body
    expect(body.notified).toBe(0)
    expect(body.errors).toBe(0)
    expect(mockSendNewEpisodeEmail).not.toHaveBeenCalled()
  })

  it('sends email when tracked anime has new episode', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(101, 5)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])          // distinct users
      .mockResolvedValueOnce([makeTracked('u1', 101)])     // user's tracked list
    mockGetUser.mockResolvedValue(makeUser('user@test.com'))
    mockFindUnique.mockResolvedValue(null) // not yet notified

    await GET()

    expect(mockSendNewEpisodeEmail).toHaveBeenCalledOnce()
    const call = mockSendNewEpisodeEmail.mock.calls[0][0]
    expect(call.toEmail).toBe('user@test.com')
    expect(call.newEpisodes).toHaveLength(1)
    expect(call.newEpisodes[0].episode).toBe(5)
    expect(call.newEpisodes[0].mediaId).toBe(101)
  })

  it('sends email when known sequel has new episode', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(202, 3)])
    const tracked = { ...makeTracked('u1', 101), knownSequels: [{ sequelAnilistId: 202 }] }
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([tracked])
    mockGetUser.mockResolvedValue(makeUser())
    mockFindUnique.mockResolvedValue(null)

    await GET()

    expect(mockSendNewEpisodeEmail).toHaveBeenCalledOnce()
    const ep = mockSendNewEpisodeEmail.mock.calls[0][0].newEpisodes[0]
    expect(ep.mediaId).toBe(202)
    expect(ep.episode).toBe(3)
  })

  it('does not send email for already-notified episode', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(101, 5)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([makeTracked('u1', 101)])
    mockGetUser.mockResolvedValue(makeUser())
    mockFindUnique.mockResolvedValue({ id: 1 }) // already notified

    await GET()

    expect(mockSendNewEpisodeEmail).not.toHaveBeenCalled()
  })

  it('records notification after successful email', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(101, 7)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([makeTracked('u1', 101)])
    mockGetUser.mockResolvedValue(makeUser())
    mockFindUnique.mockResolvedValue(null)

    await GET()

    expect(mockCreate).toHaveBeenCalledOnce()
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      sequelAnilistId: 101,
      type: 'EPISODE_7',
    })
  })

  it('skips user with no email address', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(101, 1)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([makeTracked('u1', 101)])
    mockGetUser.mockResolvedValue({ emailAddresses: [], primaryEmailAddressId: null })

    await GET()

    expect(mockSendNewEpisodeEmail).not.toHaveBeenCalled()
  })

  it('does not notify when aired episode has no matching user', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(999, 4)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([makeTracked('u1', 101)]) // tracks 101, not 999
    mockGetUser.mockResolvedValue(makeUser())

    await GET()

    expect(mockSendNewEpisodeEmail).not.toHaveBeenCalled()
  })

  it('tracks errors when email send throws', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(101, 5)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([makeTracked('u1', 101)])
    mockGetUser.mockResolvedValue(makeUser())
    mockFindUnique.mockResolvedValue(null)
    mockSendNewEpisodeEmail.mockRejectedValue(new Error('SMTP failure'))

    const res = await GET()
    const body = (res as any)._body
    expect(body.errors).toBe(1)
    expect(body.notified).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('includes upcoming episodes in the email payload', async () => {
    const upcoming = [
      { episode: 6, airingAt: NOW + 7 * 86400 },
      { episode: 7, airingAt: NOW + 14 * 86400 },
    ]
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(101, 5)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }])
      .mockResolvedValueOnce([makeTracked('u1', 101)])
    mockGetUser.mockResolvedValue(makeUser())
    mockFindUnique.mockResolvedValue(null)
    mockGetAnimeAiringSchedule.mockResolvedValue({ nextAiringEpisode: null, upcoming })

    await GET()

    const ep = mockSendNewEpisodeEmail.mock.calls[0][0].newEpisodes[0]
    expect(ep.upcoming).toEqual(upcoming.slice(0, 3))
  })

  it('handles multiple users independently', async () => {
    mockGetAiringScheduleInRange.mockResolvedValue([makeAiredEntry(101, 2)])
    mockFindMany
      .mockResolvedValueOnce([{ userId: 'u1' }, { userId: 'u2' }])
      .mockResolvedValueOnce([makeTracked('u1', 101)])
      .mockResolvedValueOnce([makeTracked('u2', 101)])
    mockGetUser
      .mockResolvedValueOnce(makeUser('a@example.com'))
      .mockResolvedValueOnce(makeUser('b@example.com'))
    mockFindUnique.mockResolvedValue(null)

    await GET()

    expect(mockSendNewEpisodeEmail).toHaveBeenCalledTimes(2)
    const emails = mockSendNewEpisodeEmail.mock.calls.map((c) => c[0].toEmail)
    expect(emails).toContain('a@example.com')
    expect(emails).toContain('b@example.com')
  })
})
