import { describe, it, expect, vi, afterEach } from 'vitest'
import { categorize } from '@/components/TrackedList'
import type { AnimeSeasonInfo } from '@/app/(app)/page'
import type { RelationNode } from '@/lib/anilist'

function makeRelation(overrides: Partial<RelationNode> = {}): RelationNode {
  return {
    id: 999,
    format: 'TV',
    title: { romaji: 'Some Sequel' },
    status: 'FINISHED',
    startDate: { year: null, month: null, day: null },
    ...overrides,
  }
}

function makeInfo(overrides: Partial<AnimeSeasonInfo> = {}): AnimeSeasonInfo {
  return {
    next: null,
    available: null,
    ...overrides,
  }
}

describe('categorize', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "error" when info is undefined', () => {
    expect(categorize(undefined, 'completed')).toBe('error')
  })

  it('returns "error" when info.error is true', () => {
    expect(categorize(makeInfo({ error: true }), 'completed')).toBe('error')
  })

  it('prioritizes "error" over an available sequel', () => {
    const info = makeInfo({ error: true, available: makeRelation() })
    expect(categorize(info, 'watching')).toBe('error')
  })

  it('returns "available" when a finished untracked sequel exists', () => {
    const info = makeInfo({ available: makeRelation({ id: 166521, status: 'FINISHED' }) })
    expect(categorize(info, 'completed')).toBe('available')
  })

  it('returns "available" instead of "releasing"/"upcoming" even when next is also set', () => {
    const info = makeInfo({
      available: makeRelation({ id: 1 }),
      next: makeRelation({ id: 2, status: 'RELEASING' }),
    })
    expect(categorize(info, 'completed')).toBe('available')
  })

  it('returns "available" (not "watching") when an available sequel exists and watchStatus is "watching" — regression for the Golden Kamuy bug', () => {
    const info = makeInfo({ available: makeRelation({ id: 166521 }) })
    expect(categorize(info, 'watching')).toBe('available')
  })

  it('returns "releasing" when the next season status is RELEASING', () => {
    const info = makeInfo({ next: makeRelation({ status: 'RELEASING' }) })
    expect(categorize(info, 'completed')).toBe('releasing')
  })

  it('returns "releasing" when the next season starts this month, even if not yet marked RELEASING', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 11)) // July 2026 (JS months are 0-indexed)
    const info = makeInfo({
      next: makeRelation({ status: 'NOT_YET_RELEASED', startDate: { year: 2026, month: 7, day: 20 } }),
    })
    expect(categorize(info, 'completed')).toBe('releasing')
  })

  it('returns "upcoming" when the next season is not yet released and not this month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 11)) // July 2026
    const info = makeInfo({
      next: makeRelation({ status: 'NOT_YET_RELEASED', startDate: { year: 2027, month: 1, day: 5 } }),
    })
    expect(categorize(info, 'completed')).toBe('upcoming')
  })

  it('returns "watching" when there is no available/next season and watchStatus is "watching"', () => {
    const info = makeInfo()
    expect(categorize(info, 'watching')).toBe('watching')
  })

  it('returns "completed" when there is no available/next season and watchStatus is "completed"', () => {
    const info = makeInfo()
    expect(categorize(info, 'completed')).toBe('completed')
  })

  it('returns "completed" when watchStatus is not provided', () => {
    const info = makeInfo()
    expect(categorize(info)).toBe('completed')
  })
})
