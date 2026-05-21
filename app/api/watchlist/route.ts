import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const items = await prisma.watchListItem.findMany({ orderBy: { addedAt: 'desc' } })
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const { anilistId, title, coverImage } = await req.json()
  if (!anilistId || !title) {
    return NextResponse.json({ error: 'חסרים שדות' }, { status: 400 })
  }
  const existing = await prisma.watchListItem.findUnique({ where: { anilistId } })
  if (existing) return NextResponse.json({ item: existing, existing: true })
  const item = await prisma.watchListItem.create({
    data: { anilistId, title, coverImage: coverImage ?? null },
  })
  return NextResponse.json({ item })
}

export async function DELETE(req: NextRequest) {
  const anilistId = Number(new URL(req.url).searchParams.get('anilistId'))
  if (!anilistId) return NextResponse.json({ error: 'חסר anilistId' }, { status: 400 })
  await prisma.watchListItem.deleteMany({ where: { anilistId } })
  return NextResponse.json({ ok: true })
}
