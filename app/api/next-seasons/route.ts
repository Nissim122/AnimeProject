import { NextRequest, NextResponse } from 'next/server'
import { getAnimeStatusWithSequels, getAnimeSequels } from '@/lib/anilist'
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

        const available = pickAvailable(sequels, trackedSet)

        // Detect if a season/movie is currently releasing while the user is still behind
        let hasReleasingAhead = false
        if (available) {
          if (next && next.status === 'RELEASING') {
            // Direct sequels include both a finished (available) and a releasing one
            hasReleasingAhead = true
          } else {
            // Check one level deeper: does the available sequel itself have a releasing sequel?
            try {
              const level2 = await getAnimeSequels(available.id, { includeMovies: true })
              hasReleasingAhead = level2.some((s) => s.status === 'RELEASING')
            } catch {
              // ignore — hasReleasingAhead stays false
            }
          }
        }

        return [id, { next, available, hasReleasingAhead }] as const
      } catch {
        return [id, { next: null, available: null, hasReleasingAhead: false }] as const
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
