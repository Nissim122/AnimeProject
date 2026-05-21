import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels } from '@/lib/anilist'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { anilistId, title, coverImage, totalEpisodes } = body as {
      anilistId: number
      title: string
      coverImage?: string
      totalEpisodes?: number
    }

    if (!anilistId || !title) {
      return NextResponse.json({ error: 'Missing anilistId or title' }, { status: 400 })
    }

    const existing = await prisma.trackedAnime.findUnique({ where: { anilistId } })
    if (existing) {
      return NextResponse.json({ message: 'Already tracked', anime: existing })
    }

    const anime = await prisma.trackedAnime.create({
      data: {
        anilistId,
        title,
        coverImage,
        totalEpisodes: totalEpisodes ?? null,
        watchedEpisodes: totalEpisodes ?? 0,
      },
    })

    // Save currently known sequels so we don't notify for them later
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

export async function PATCH(req: NextRequest) {
  try {
    const { anilistId, watchedEpisodes } = await req.json() as {
      anilistId: number
      watchedEpisodes: number
    }
    if (!anilistId || watchedEpisodes == null) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    await prisma.trackedAnime.update({
      where: { anilistId },
      data: { watchedEpisodes: Math.max(0, watchedEpisodes) },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[track PATCH]', err)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const anilistId = Number(req.nextUrl.searchParams.get('anilistId'))
    if (!anilistId) {
      return NextResponse.json({ error: 'Missing anilistId' }, { status: 400 })
    }

    await prisma.trackedAnime.delete({ where: { anilistId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[track DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove anime' }, { status: 500 })
  }
}
