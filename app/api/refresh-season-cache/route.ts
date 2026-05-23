import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshCacheForIds } from '@/lib/seasonCache'
import { withRateLimit } from '@/lib/anilist'

export const maxDuration = 300

function checkAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function run() {
  const rows = await prisma.trackedAnime.findMany({
    select: { anilistId: true },
    distinct: ['anilistId'],
  })
  const ids = rows.map((r) => r.anilistId)
  const result = await withRateLimit(() => refreshCacheForIds(ids))
  console.log(`[refresh-season-cache] refreshed=${result.refreshed} errors=${result.errors} total=${ids.length}`)
  return NextResponse.json({ ...result, total: ids.length })
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
