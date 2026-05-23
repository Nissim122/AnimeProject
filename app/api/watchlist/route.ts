import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const items = await prisma.watchListItem.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
    })
    return NextResponse.json({ items })
  } catch (err) {
    console.error('[watchlist GET]', err)
    return NextResponse.json({ error: 'Failed to fetch watchlist' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { anilistId, title, coverImage } = await req.json()
    if (!anilistId || !title) {
      return NextResponse.json({ error: 'חסרים שדות' }, { status: 400 })
    }
    const existing = await prisma.watchListItem.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
    })
    if (existing) return NextResponse.json({ item: existing, existing: true })
    const item = await prisma.watchListItem.create({
      data: { userId, anilistId, title, coverImage: coverImage ?? null },
    })
    return NextResponse.json({ item })
  } catch (err) {
    console.error('[watchlist POST]', err)
    return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const anilistId = Number(new URL(req.url).searchParams.get('anilistId'))
    if (!anilistId) return NextResponse.json({ error: 'חסר anilistId' }, { status: 400 })
    await prisma.watchListItem.deleteMany({ where: { userId, anilistId } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[watchlist DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove from watchlist' }, { status: 500 })
  }
}
