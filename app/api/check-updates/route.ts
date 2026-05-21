import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels, delay } from '@/lib/anilist'
import { sendNewSeasonEmail, isEmailConfigured } from '@/lib/mailer'

export interface UpdateResult {
  checked: number
  notified: number
  errors: number
  notifications: Array<{ parent: string; sequel: string }>
}

export async function runUpdateCheck(): Promise<UpdateResult> {
  const result: UpdateResult = { checked: 0, notified: 0, errors: 0, notifications: [] }

  const tracked = await prisma.trackedAnime.findMany({
    include: { knownSequels: true },
  })

  for (const anime of tracked) {
    result.checked++
    try {
      await delay(700) // AniList rate limit protection

      const sequels = await getAnimeSequels(anime.anilistId)
      const knownIds = new Set(anime.knownSequels.map((s) => s.sequelAnilistId))

      for (const sequel of sequels) {
        if (knownIds.has(sequel.id)) continue // already known

        // Save to known sequels regardless of status
        await prisma.knownSequel.upsert({
          where: { trackedAnimeId_sequelAnilistId: { trackedAnimeId: anime.id, sequelAnilistId: sequel.id } },
          create: { trackedAnimeId: anime.id, sequelAnilistId: sequel.id },
          update: {},
        })

        // Only notify if it's releasing or upcoming (not finished)
        if (sequel.status !== 'RELEASING' && sequel.status !== 'NOT_YET_RELEASED') continue

        // Check if already notified
        const alreadyNotified = await prisma.sentNotification.findUnique({
          where: { sequelAnilistId: sequel.id },
        })
        if (alreadyNotified) continue

        // Send email — only record as notified if email was actually sent
        const sent = await sendNewSeasonEmail({
          parentTitle: anime.title,
          sequelTitle: sequel.title.romaji,
          sequelYear: sequel.startDate.year,
          status: sequel.status,
        })
        if (!sent) continue

        await prisma.sentNotification.create({
          data: {
            sequelAnilistId: sequel.id,
            sequelTitle: sequel.title.romaji,
            parentTitle: anime.title,
          },
        })

        result.notified++
        result.notifications.push({ parent: anime.title, sequel: sequel.title.romaji })
      }
    } catch (err) {
      console.error(`[check-updates] Error checking ${anime.title}:`, err)
      result.errors++
    }
  }

  console.log(`[check-updates] Done — checked: ${result.checked}, notified: ${result.notified}, errors: ${result.errors}`)
  return result
}

export async function POST() {
  try {
    const result = await runUpdateCheck()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[check-updates]', err)
    return NextResponse.json({ error: 'Update check failed' }, { status: 500 })
  }
}
