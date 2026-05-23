import { NextRequest, NextResponse } from 'next/server'
import { getAllSeasons, withRateLimit } from '@/lib/anilist'

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id')
  const id = Number(idParam)
  if (!idParam || isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  try {
    const seasons = await withRateLimit(() => getAllSeasons(id))
    return NextResponse.json({ seasons })
  } catch (err) {
    console.error('[seasons] getAllSeasons failed:', err)
    return NextResponse.json({ error: 'Failed to fetch seasons' }, { status: 502 })
  }
}
