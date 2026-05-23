import { prisma } from './prisma'
import { getAllSeasons } from './anilist'
import type { AnimeResult } from './anilist'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function getCachedAllSeasons(anilistId: number): Promise<AnimeResult[]> {
  const cached = await prisma.seasonCache.findUnique({ where: { anilistId } })
  if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return JSON.parse(cached.seasonsJson) as AnimeResult[]
  }
  const seasons = await getAllSeasons(anilistId)
  await prisma.seasonCache.upsert({
    where: { anilistId },
    create: { anilistId, seasonsJson: JSON.stringify(seasons) },
    update: { seasonsJson: JSON.stringify(seasons) },
  })
  return seasons
}

export async function refreshCacheForIds(anilistIds: number[]): Promise<{ refreshed: number; errors: number }> {
  let refreshed = 0
  let errors = 0
  for (const id of anilistIds) {
    try {
      const seasons = await getAllSeasons(id)
      await prisma.seasonCache.upsert({
        where: { anilistId: id },
        create: { anilistId: id, seasonsJson: JSON.stringify(seasons) },
        update: { seasonsJson: JSON.stringify(seasons) },
      })
      refreshed++
    } catch {
      errors++
    }
  }
  return { refreshed, errors }
}
