import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshCacheForIds } from '@/lib/seasonCache'
import { withRateLimit } from '@/lib/anilist'

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const rows = await prisma.trackedAnime.findMany({
    select: { anilistId: true },
    distinct: ['anilistId'],
  })
  const ids = rows.map((r) => r.anilistId)

  const result = await withRateLimit(() => refreshCacheForIds(ids))

  console.log(`[refresh-season-cache] refreshed=${result.refreshed} errors=${result.errors}`)
  return NextResponse.json({ ...result, total: ids.length })
}
