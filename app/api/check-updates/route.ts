import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels, getAllSeasons, delay, RelationNode } from '@/lib/anilist'
import { sendMonthStartEmail, sendDayBeforeEmail } from '@/lib/mailer'
import { translateToHebrew } from '@/lib/translate'

export interface UpdateResult {
  checked: number
  notified: number
  errors: number
  notifications: Array<{ parent: string; sequel: string; type: string }>
}

function isCurrentMonth(startDate: RelationNode['startDate']): boolean {
  if (!startDate.year || !startDate.month) return false
  const now = new Date()
  return startDate.year === now.getFullYear() && startDate.month === now.getMonth() + 1
}

function isTomorrow(startDate: RelationNode['startDate']): boolean {
  if (!startDate.year || !startDate.month || !startDate.day) return false
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return (
    startDate.year === tomorrow.getFullYear() &&
    startDate.month === tomorrow.getMonth() + 1 &&
    startDate.day === tomorrow.getDate()
  )
}

async function hasSentNotification(sequelId: number, type: string): Promise<boolean> {
  const existing = await prisma.sentNotification.findUnique({
    where: { sequelAnilistId_type: { sequelAnilistId: sequelId, type } },
  })
  return !!existing
}

async function recordNotification(
  sequelId: number,
  type: string,
  sequelTitle: string,
  parentTitle: string
): Promise<void> {
  await prisma.sentNotification.create({
    data: { sequelAnilistId: sequelId, type, sequelTitle, parentTitle },
  })
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
        // Always register new sequels in KnownSequel
        if (!knownIds.has(sequel.id)) {
          await prisma.knownSequel.upsert({
            where: { trackedAnimeId_sequelAnilistId: { trackedAnimeId: anime.id, sequelAnilistId: sequel.id } },
            create: { trackedAnimeId: anime.id, sequelAnilistId: sequel.id },
            update: {},
          })
        }

        if (sequel.status !== 'RELEASING' && sequel.status !== 'NOT_YET_RELEASED') continue

        // MONTH_START: releasing now, or scheduled for this month
        const qualifiesForMonthStart =
          sequel.status === 'RELEASING' ||
          (sequel.status === 'NOT_YET_RELEASED' && isCurrentMonth(sequel.startDate))

        if (qualifiesForMonthStart && !(await hasSentNotification(sequel.id, 'MONTH_START'))) {
          const allSeasons = await getAllSeasons(anime.anilistId)
          const baseTitle = allSeasons[0]?.title.english ?? allSeasons[0]?.title.romaji ?? anime.title
          const hebrewTitle = await translateToHebrew(baseTitle).catch(() => baseTitle)
          const englishTitle = allSeasons[0]?.title.english ?? allSeasons[0]?.title.romaji ?? anime.title

          const sent = await sendMonthStartEmail({
            hebrewTitle,
            englishTitle,
            sequelId: sequel.id,
            sequelTitle: sequel.title.romaji,
            startDate: sequel.startDate,
            status: sequel.status,
            seasons: allSeasons,
          })
          if (sent) {
            await recordNotification(sequel.id, 'MONTH_START', sequel.title.romaji, anime.title)
            result.notified++
            result.notifications.push({ parent: anime.title, sequel: sequel.title.romaji, type: 'MONTH_START' })
          }
        }

        // DAY_BEFORE: start is tomorrow
        if (
          sequel.status === 'NOT_YET_RELEASED' &&
          isTomorrow(sequel.startDate) &&
          !(await hasSentNotification(sequel.id, 'DAY_BEFORE'))
        ) {
          const sent = await sendDayBeforeEmail({
            parentTitle: anime.title,
            sequelTitle: sequel.title.romaji,
            startDate: sequel.startDate,
          })
          if (sent) {
            await recordNotification(sequel.id, 'DAY_BEFORE', sequel.title.romaji, anime.title)
            result.notified++
            result.notifications.push({ parent: anime.title, sequel: sequel.title.romaji, type: 'DAY_BEFORE' })
          }
        }
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
