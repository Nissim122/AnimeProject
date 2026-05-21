import { NextRequest, NextResponse } from 'next/server'
import { getAnimeStatusWithSequels, getAnimeSequels, getAllSeasons } from '@/lib/anilist'
import type { RelationNode } from '@/lib/anilist'

export async function GET(req: NextRequest) {
  const ids = req.nextUrl.searchParams.get('ids')
  if (!ids) return NextResponse.json({})

  const idList = ids
    .split(',')
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0)

  const trackedSet = new Set(idList)

  const entries = await Promise.all(
    idList.map(async (id) => {
      try {
        const { status, startDate, sequels } = await getAnimeStatusWithSequels(id, { includeMovies: true })

        const upcoming = pickUpcoming(sequels)
        const next: RelationNode | null = upcoming ?? (
          status === 'RELEASING'
            ? { id, format: 'TV', title: { romaji: '' }, status: 'RELEASING', startDate }
            : null
        )

        let available = pickAvailable(sequels, trackedSet)
        let allWatched: boolean | undefined = undefined

        // When no direct sequel found, scan the full season chain
        if (!next && !available) {
          try {
            const allSeasons = await getAllSeasons(id)
            const trackedIdx = allSeasons.findIndex((s) => trackedSet.has(s.id))
            const laterSeasons = trackedIdx >= 0 ? allSeasons.slice(trackedIdx + 1) : []
            const untracked = laterSeasons.filter(
              (s) => s.status === 'FINISHED' && !trackedSet.has(s.id)
            )
            if (untracked.length > 0) {
              const earliest = untracked[0]
              available = {
                id: earliest.id,
                format: earliest.format,
                title: { romaji: earliest.title.english ?? earliest.title.romaji },
                status: 'FINISHED',
                startDate: { year: earliest.seasonYear ?? null, month: null, day: null },
              }
            } else if (trackedIdx >= 0) {
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

        return [id, { next, available, hasReleasingAhead, allWatched }] as const
      } catch {
        return [id, { next: null, available: null, hasReleasingAhead: false, allWatched: undefined }] as const
      }
    })
  )

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
