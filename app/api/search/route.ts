import { NextRequest, NextResponse } from 'next/server'
import { searchAnime } from '@/lib/anilist'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const results = await searchAnime(q)
    return NextResponse.json({ results })
  } catch (err) {
    console.error('[search]', err)
    return NextResponse.json({ error: 'Failed to search AniList' }, { status: 500 })
  }
}
