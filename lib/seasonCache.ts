import { prisma } from './prisma'
import { getAllSeasons } from './anilist'
import type { AnimeResult } from './anilist'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isValidSeasons(json: string): boolean {
  try {
    const data = JSON.parse(json)
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

export async function getCachedAllSeasons(anilistId: number): Promise<AnimeResult[]> {
  const cached = await prisma.seasonCache.findUnique({ where: { anilistId } })
  // Only use cache when it has real data and is within TTL.
  // An empty cached result means a prior AniList failure was saved — skip it and retry.
  if (cached && isValidSeasons(cached.seasonsJson) && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return JSON.parse(cached.seasonsJson) as AnimeResult[]
  }
  const seasons = await getAllSeasons(anilistId)
  // Don't persist an empty result — it likely reflects a transient AniList failure.
  // Leaving the entry absent lets the next request retry instead of serving stale empty data.
  if (seasons.length > 0) {
    await prisma.seasonCache.upsert({
      where: { anilistId },
      create: { anilistId, seasonsJson: JSON.stringify(seasons) },
      update: { seasonsJson: JSON.stringify(seasons) },
    })
  }
  return seasons
}

export async function refreshCacheForIds(anilistIds: number[]): Promise<{ refreshed: number; errors: number; skipped: number }> {
  // Only refresh IDs that have no valid cache entry (no entry or empty result).
  // Series with valid cached data don't need a refresh — their TTL handles it naturally.
  const existing = await prisma.seasonCache.findMany({
    where: { anilistId: { in: anilistIds } },
    select: { anilistId: true, seasonsJson: true },
  })

  const validCachedIds = new Set(
    existing.filter((e) => isValidSeasons(e.seasonsJson)).map((e) => e.anilistId)
  )

  const idsToRefresh = anilistIds.filter((id) => !validCachedIds.has(id))
  const skipped = anilistIds.length - idsToRefresh.length

  let refreshed = 0
  let errors = 0

  for (const id of idsToRefresh) {
    try {
      const seasons = await getAllSeasons(id)
      if (seasons.length > 0) {
        await prisma.seasonCache.upsert({
          where: { anilistId: id },
          create: { anilistId: id, seasonsJson: JSON.stringify(seasons) },
          update: { seasonsJson: JSON.stringify(seasons) },
        })
        refreshed++
      }
    } catch {
      errors++
    }
  }
  return { refreshed, errors, skipped }
}

export async function clearSeasonCache(): Promise<void> {
  await prisma.seasonCache.deleteMany()
}
