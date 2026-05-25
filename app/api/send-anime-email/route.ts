import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getAllSeasons, withRateLimit } from '@/lib/anilist'
import { sendConsolidatedMonthlyEmail } from '@/lib/mailer'
import { translateToHebrew } from '@/lib/translate'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { anilistId?: number }
  if (!body.anilistId) return NextResponse.json({ error: 'Missing anilistId' }, { status: 400 })

  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
  if (!email) return NextResponse.json({ error: 'No email found' }, { status: 400 })

  const [trackedEntry, allTracked] = await Promise.all([
    prisma.trackedAnime.findFirst({ where: { userId, anilistId: body.anilistId } }),
    prisma.trackedAnime.findMany({ where: { userId }, select: { anilistId: true } }),
  ])
  const userTrackedIds = new Set(allTracked.map((t) => t.anilistId))

  const allSeasons = await withRateLimit(() => getAllSeasons(body.anilistId!))

  const items: Parameters<typeof sendConsolidatedMonthlyEmail>[0]['items'] = []
  const available: NonNullable<Parameters<typeof sendConsolidatedMonthlyEmail>[0]['available']> = []

  for (const season of allSeasons) {
    if (season.status === 'RELEASING' || season.status === 'NOT_YET_RELEASED') {
      const baseTitle = season.title.english ?? season.title.romaji
      const hebrewTitle = await translateToHebrew(baseTitle).catch(() => baseTitle)
      items.push({
        hebrewTitle,
        englishTitle: season.title.english ?? season.title.romaji,
        sequelTitle: season.title.romaji,
        coverImage: season.coverImage?.large,
        status: season.status,
        nextAiringEpisode: season.nextAiringEpisode ?? null,
        sequelEpisodeCount: season.episodes ?? null,
        totalSeasons: allSeasons.length,
        sequelId: season.id,
        startDate: season.startDate ?? { year: null, month: null, day: null },
        seasons: allSeasons,
      })
    } else if (season.status === 'FINISHED' && !userTrackedIds.has(season.id)) {
      const idx = allSeasons.findIndex((s) => s.id === season.id)
      available.push({
        parentTitle: trackedEntry?.title ?? season.title.romaji,
        sequelTitle: season.title.english ?? season.title.romaji,
        currentSeasonNumber: idx >= 0 ? idx + 1 : undefined,
        totalSeasons: allSeasons.length,
        anilistId: season.id,
      })
    }
  }

  if (items.length === 0 && available.length === 0) {
    return NextResponse.json({ sent: false, reason: 'nothing_to_send' })
  }

  const sent = await sendConsolidatedMonthlyEmail({
    items,
    available: available.length > 0 ? available : undefined,
    toEmail: email,
  })

  return NextResponse.json({ sent })
}
