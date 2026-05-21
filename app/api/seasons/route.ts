import { NextRequest, NextResponse } from 'next/server'
import { getAllSeasons } from '@/lib/anilist'

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get('id')
  const id = Number(idParam)
  if (!idParam || isNaN(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  const seasons = await getAllSeasons(id)
  return NextResponse.json({ seasons })
}
