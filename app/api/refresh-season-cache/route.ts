import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshCacheForIds, clearSeasonCache } from '@/lib/seasonCache'
import { setStatusCacheBatch, clearStatusCache } from '@/lib/statusCache'
import { batchGetAnimeStatus, withRateLimit, delay } from '@/lib/anilist'

export const maxDuration = 300

function checkAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function run() {
  return withRateLimit(async () => {
    // Step 1: Wipe both caches so everything gets recomputed fresh
    await Promise.all([clearStatusCache(), clearSeasonCache()])

    // Step 2: Get every distinct anilistId tracked by any user
    const rows = await prisma.trackedAnime.findMany({
      select: { anilistId: true },
      distinct: ['anilistId'],
    })
    const ids = rows.map((r) => r.anilistId)

    // Step 3: Refill StatusCache — batch 50 at a time (AniList page limit)
    // Delay 700ms between batches to stay within the shared rate-limit context
    let statusRefreshed = 0
    let statusErrors = 0
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      if (i > 0) await delay(700)
      try {
        const statusMap = await batchGetAnimeStatus(batch, { includeMovies: true })
        await setStatusCacheBatch([...statusMap.entries()])
        statusRefreshed += statusMap.size
      } catch (err) {
        console.error(`[refresh-season-cache] status batch ${i}–${i + 50} failed:`, err)
        statusErrors += batch.length
      }
    }

    // Step 4: Refill SeasonCache — BFS per anime, inherits the rate-limit context above
    // refreshCacheForIds refreshes all IDs because the cache was just cleared
    const seasonResult = await refreshCacheForIds(ids)

    console.log(
      `[refresh-season-cache] status: refreshed=${statusRefreshed} errors=${statusErrors}` +
      ` | seasons: refreshed=${seasonResult.refreshed} errors=${seasonResult.errors} total=${ids.length}`
    )

    return NextResponse.json({
      total: ids.length,
      status: { refreshed: statusRefreshed, errors: statusErrors },
      seasons: { refreshed: seasonResult.refreshed, errors: seasonResult.errors },
    })
  })
}

// Vercel cron calls GET
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return run()
}

// Manual trigger from UI / scripts
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return run()
}
