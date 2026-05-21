import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels, getAnimeStatusWithSequels, getAllSeasons, delay, RelationNode } from '@/lib/anilist'
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
      const knownIds = new Set(anime.knownSequels.map((s) => s.sequelAnilistId))

      // Fix: also check known sequels for new children (multi-generation chains: S1→S2 known, S3 new)
      const idsToCheck = [anime.anilistId, ...knownIds]
      const allSequels: RelationNode[] = []
      const seenSequelIds = new Set<number>()

      for (const parentId of idsToCheck) {
        await delay(700) // AniList rate limit protection
        const sequels = await getAnimeSequels(parentId)
        for (const s of sequels) {
          if (!seenSequelIds.has(s.id)) {
            seenSequelIds.add(s.id)
            allSequels.push(s)
          }
        }
      }

      for (const sequel of allSequels) {
        if (sequel.status !== 'RELEASING' && sequel.status !== 'NOT_YET_RELEASED') continue

        // RELEASING: always notify every check (no dedup).
        // NOT_YET_RELEASED this month: notify once.
        const qualifiesForMonthStart =
          sequel.status === 'RELEASING' ||
          (sequel.status === 'NOT_YET_RELEASED' && isCurrentMonth(sequel.startDate))

        const shouldNotify =
          qualifiesForMonthStart &&
          (sequel.status === 'RELEASING' || !(await hasSentNotification(sequel.id, 'MONTH_START')))

        if (shouldNotify) {
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
            if (sequel.status !== 'RELEASING') {
              try {
                await recordNotification(sequel.id, 'MONTH_START', sequel.title.romaji, anime.title)
              } catch (recordErr) {
                console.error(`[check-updates] CRITICAL: email sent for ${sequel.title.romaji} (MONTH_START) but failed to record — will retry next run`, recordErr)
              }
            }
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
            try {
              await recordNotification(sequel.id, 'DAY_BEFORE', sequel.title.romaji, anime.title)
            } catch (recordErr) {
              console.error(`[check-updates] CRITICAL: email sent for ${sequel.title.romaji} (DAY_BEFORE) but failed to record — will retry next run`, recordErr)
            }
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
