import { prisma } from './prisma'
import type { RelationNode } from './anilist'

const STATUS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

type StatusData = {
  status: string
  startDate: { year: number | null; month: number | null; day: number | null }
  sequels: RelationNode[]
}

export async function getStatusCacheBatch(anilistIds: number[]): Promise<Map<number, StatusData>> {
  if (anilistIds.length === 0) return new Map()
  const rows = await prisma.statusCache.findMany({
    where: { anilistId: { in: anilistIds } },
  })
  const now = Date.now()
  return new Map(
    rows
      .filter((r) => now - r.updatedAt.getTime() < STATUS_CACHE_TTL_MS)
      .map((r) => [
        r.anilistId,
        {
          status: r.status,
          startDate: JSON.parse(r.startDateJson) as StatusData['startDate'],
          sequels: JSON.parse(r.sequelsJson) as RelationNode[],
        },
      ])
  )
}

export async function setStatusCacheBatch(entries: Array<[number, StatusData]>): Promise<void> {
  if (entries.length === 0) return
  await Promise.all(
    entries.map(([anilistId, data]) =>
      prisma.statusCache.upsert({
        where: { anilistId },
        create: {
          anilistId,
          status: data.status,
          startDateJson: JSON.stringify(data.startDate),
          sequelsJson: JSON.stringify(data.sequels),
        },
        update: {
          status: data.status,
          startDateJson: JSON.stringify(data.startDate),
          sequelsJson: JSON.stringify(data.sequels),
        },
      })
    )
  )
}

export async function deleteStatusCacheBatch(anilistIds: number[]): Promise<void> {
  if (anilistIds.length === 0) return
  await prisma.statusCache.deleteMany({ where: { anilistId: { in: anilistIds } } })
}

export async function clearStatusCache(): Promise<void> {
  await prisma.statusCache.deleteMany()
}
