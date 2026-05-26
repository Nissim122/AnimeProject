import { NextRequest, NextResponse } from 'next/server'
import { batchGetAnimeStatus, getAnimeSequels, withRateLimit } from '@/lib/anilist'
import { getCachedAllSeasons, deleteSeasonCacheBatch } from '@/lib/seasonCache'
import { getStatusCacheBatch, setStatusCacheBatch, deleteStatusCacheBatch } from '@/lib/statusCache'
import type { RelationNode } from '@/lib/anilist'

export async function GET(req: NextRequest) {
  return withRateLimit(() => handler(req))
}

async function handler(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')
  if (!ids) return NextResponse.json({})

  const idList = ids
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0)

  // If clearCache IDs are provided, wipe their StatusCache + SeasonCache entries
  // so the subsequent fetch goes to AniList fresh (mirrors the weekly refresh logic).
  const clearCacheParam = req.nextUrl.searchParams.get('clearCache')
  if (clearCacheParam) {
    const clearIds = clearCacheParam.split(',').map(Number).filter((n) => !isNaN(n) && n > 0)
    await Promise.all([deleteStatusCacheBatch(clearIds), deleteSeasonCacheBatch(clearIds)])
  }

  const allTrackedIdsParam = req.nextUrl.searchParams.get('allTrackedIds')
  const allTrackedIdList = allTrackedIdsParam
    ? allTrackedIdsParam.split(',').map(Number).filter((n) => !isNaN(n) && n > 0)
    : idList
  const trackedSet = new Set(allTrackedIdList)

  const entries: Array<readonly [number, { next: RelationNode | null; available: RelationNode | null; hasReleasingAhead: boolean; allWatched: boolean | undefined; error?: boolean }]> = []

  // Fetch status + direct sequels — check StatusCache first, fall back to AniList for misses
  let statusMap: Awaited<ReturnType<typeof batchGetAnimeStatus>>
  try {
    const cached = await getStatusCacheBatch(idList)
    const missingIds = idList.filter((id) => !cached.has(id))
    if (missingIds.length > 0) {
      const fresh = await batchGetAnimeStatus(missingIds, { includeMovies: true })
      // Persist the fresh data so the next request is instant
      setStatusCacheBatch([...fresh.entries()]).catch(() => {})
      statusMap = new Map([...cached, ...fresh])
    } else {
      statusMap = cached
    }
  } catch {
    return NextResponse.json(
      Object.fromEntries(
        idList.map((id) => [id, { next: null, available: null, hasReleasingAhead: false, allWatched: undefined, error: true }])
      )
    )
  }

  for (const id of idList) {
    try {
      const statusData = statusMap.get(id)
      if (!statusData) {
        entries.push([id, { next: null, available: null, hasReleasingAhead: false, allWatched: undefined, error: true }] as const)
        continue
      }

      const { status, startDate, sequels } = statusData

      let next: RelationNode | null = pickUpcoming(sequels) ?? (
        status === 'RELEASING'
          ? { id, format: 'TV', title: { romaji: '' }, status: 'RELEASING', startDate }
          : null
      )

      let available = pickAvailable(sequels, trackedSet)
      let allWatched: boolean | undefined = undefined

      // Scan the full season chain to find any finished untracked gap.
      // Must run even when a direct upcoming sequel was found, because AniList relations
      // can skip intermediate finished seasons (e.g. S1→S3 direct, S2 finished but hidden).
      if (!available) {
        try {
          const allSeasons = await getCachedAllSeasons(id)
          const trackedIdx = allSeasons.findIndex((s) => trackedSet.has(s.id))
          const laterSeasons = trackedIdx >= 0 ? allSeasons.slice(trackedIdx + 1) : []
          const laterUntracked = laterSeasons.filter((s) => !trackedSet.has(s.id))

          const finishedLater = laterUntracked.filter((s) => s.status === 'FINISHED')
          const upcomingLater = laterUntracked.filter(
            (s) => s.status === 'RELEASING' || s.status === 'NOT_YET_RELEASED'
          )

          if (finishedLater.length > 0) {
            const earliest = finishedLater[0]
            available = {
              id: earliest.id,
              format: earliest.format,
              title: { romaji: earliest.title.english ?? earliest.title.romaji },
              status: 'FINISHED',
              startDate: { year: earliest.seasonYear ?? null, month: null, day: null },
            }
          } else if (!next && upcomingLater.length > 0) {
            // No direct sequel relation — expose the chain's upcoming season
            const earliest = upcomingLater[0]
            next = {
              id: earliest.id,
              format: earliest.format,
              title: { romaji: earliest.title.english ?? earliest.title.romaji },
              status: earliest.status,
              startDate: { year: earliest.seasonYear ?? null, month: null, day: null },
            }
          } else if (trackedIdx >= 0 && !next) {
            allWatched = true
          }
        } catch {
          // allWatched stays undefined → unknown
        }
      }

      // Detect if a season/movie is currently releasing while the user is still behind
      let hasReleasingAhead = false
      if (available) {
        if (next && next.status === 'RELEASING') {
          hasReleasingAhead = true
        } else {
          try {
            const level2 = await getAnimeSequels(available.id, { includeMovies: true })
            hasReleasingAhead = level2.some((s) => s.status === 'RELEASING')
          } catch {
            // ignore — hasReleasingAhead stays false
          }
        }
      }

      entries.push([id, { next, available, hasReleasingAhead, allWatched }] as const)
    } catch {
      entries.push([id, { next: null, available: null, hasReleasingAhead: false, allWatched: undefined, error: true }] as const)
    }
  }

  return NextResponse.json(Object.fromEntries(entries))
}

function pickUpcoming(sequels: RelationNode[]): RelationNode | null {
  const candidates = sequels.filter(
    (s) => s.status === 'NOT_YET_RELEASED' || s.status === 'RELEASING'
  )
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => {
    const ay = a.startDate.year ?? 9999
    const by = b.startDate.year ?? 9999
    if (ay !== by) return ay - by
    const am = a.startDate.month ?? 99
    const bm = b.startDate.month ?? 99
    if (am !== bm) return am - bm
    const ad = a.startDate.day ?? 99
    const bd = b.startDate.day ?? 99
    return ad - bd
  })[0]
}

function pickAvailable(sequels: RelationNode[], trackedSet: Set<number>): RelationNode | null {
  const finished = sequels.filter(
    (s) => s.status === 'FINISHED' && !trackedSet.has(s.id)
  )
  if (finished.length === 0) return null
  return finished.sort(
    (a, b) => (a.startDate.year ?? 0) - (b.startDate.year ?? 0)
  )[0]
}
