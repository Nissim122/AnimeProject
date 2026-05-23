import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels } from '@/lib/anilist'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { anilistId, title, coverImage } = body as {
      anilistId: number
      title: string
      coverImage?: string
    }

    if (!anilistId || !title) {
      return NextResponse.json({ error: 'Missing anilistId or title' }, { status: 400 })
    }

    const existing = await prisma.trackedAnime.findUnique({
      where: { userId_anilistId: { userId, anilistId } },
    })
    if (existing) {
      return NextResponse.json({ message: 'Already tracked', anime: existing })
    }

    const anime = await prisma.trackedAnime.create({
      data: { userId, anilistId, title, coverImage },
    })

    try {
      const sequels = await getAnimeSequels(anilistId)
      if (sequels.length > 0) {
        await prisma.knownSequel.createMany({
          data: sequels.map((s) => ({
            trackedAnimeId: anime.id,
            sequelAnilistId: s.id,
          })),
        })
      }
    } catch (err) {
      console.warn('[track] Could not fetch initial sequels:', err)
    }

    return NextResponse.json({ anime })
  } catch (err) {
    console.error('[track POST]', err)
    return NextResponse.json({ error: 'Failed to track anime' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const anilistId = Number(req.nextUrl.searchParams.get('anilistId'))
    if (!anilistId) {
      return NextResponse.json({ error: 'Missing anilistId' }, { status: 400 })
    }

    await prisma.trackedAnime.delete({
      where: { userId_anilistId: { userId, anilistId } },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[track DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove anime' }, { status: 500 })
  }
}
