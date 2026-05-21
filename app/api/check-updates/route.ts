import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels, getAnimeStatusWithSequels, getAllSeasons, delay, RelationNode } from '@/lib/anilist'
import { sendMonthStartEmail, sendDayBeforeEmail, sendAvailableSeasonsEmail } from '@/lib/mailer'
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

interface QueuedNotification {
  anime: { anilistId: number; title: string }
  sequel: RelationNode
  type: 'MONTH_START' | 'DAY_BEFORE'
}

export async function runUpdateCheck(): Promise<UpdateResult> {
  const result: UpdateResult = { checked: 0, notified: 0, errors: 0, notifications: [] }

  const tracked = await prisma.trackedAnime.findMany({
    include: { knownSequels: true },
  })

  const trackedIdsSet = new Set(tracked.map((a) => a.anilistId))

  // Phase 1: fetch data, build notification queue and available/unwatched list
  const queue: QueuedNotification[] = []
  const availableUnwatched: Array<{ parentTitle: string; sequelTitle: string }> = []
  const seenAvailableIds = new Set<number>()

  for (const anime of tracked) {
    result.checked++
    try {
      const knownIds = new Set(anime.knownSequels.map((s) => s.sequelAnilistId))
      const allSequels: RelationNode[] = []
      const seenSequelIds = new Set<number>()

      await delay(700)
      const { status: selfStatus, startDate: selfStartDate, sequels: directSequels } =
        await getAnimeStatusWithSequels(anime.anilistId)
      seenSequelIds.add(anime.anilistId)

      if (selfStatus === 'RELEASING') {
        allSequels.push({
          id: anime.anilistId,
          format: 'TV',
          title: { romaji: anime.title },
          status: 'RELEASING',
          startDate: selfStartDate,
        })
      }
      for (const s of directSequels) {
        if (!seenSequelIds.has(s.id)) {
          seenSequelIds.add(s.id)
          allSequels.push(s)
        }
      }

      // Traverse known sequels for multi-generation chains (S1→S2 known, S3 new)
      // Also collect FINISHED sequels not yet tracked across the full chain
      const collectAvailable = (sequels: RelationNode[], label: string) => {
        for (const s of sequels) {
          if (s.status === 'FINISHED' && !trackedIdsSet.has(s.id) && !seenAvailableIds.has(s.id)) {
            seenAvailableIds.add(s.id)
            availableUnwatched.push({ parentTitle: label, sequelTitle: s.title.romaji })
          }
        }
      }

      collectAvailable(directSequels, anime.title)

      for (const knownId of knownIds) {
        await delay(700)
        const sequels = await getAnimeSequels(knownId)
        for (const s of sequels) {
          if (!seenSequelIds.has(s.id)) {
            seenSequelIds.add(s.id)
            allSequels.push(s)
          }
        }
        collectAvailable(sequels, anime.title)
      }

      // Queue notifications
      for (const sequel of allSequels) {
        if (sequel.status !== 'RELEASING' && sequel.status !== 'NOT_YET_RELEASED') continue

        const qualifiesForMonthStart =
          sequel.status === 'RELEASING' ||
          (sequel.status === 'NOT_YET_RELEASED' && isCurrentMonth(sequel.startDate))

        const shouldNotifyMonthStart =
          qualifiesForMonthStart &&
          !(await hasSentNotification(sequel.id, 'MONTH_START'))

        if (shouldNotifyMonthStart) {
          queue.push({ anime, sequel, type: 'MONTH_START' })
        }

        if (
          sequel.status === 'NOT_YET_RELEASED' &&
          isTomorrow(sequel.startDate) &&
          !(await hasSentNotification(sequel.id, 'DAY_BEFORE'))
        ) {
          queue.push({ anime, sequel, type: 'DAY_BEFORE' })
        }
      }
    } catch (err) {
      console.error(`[check-updates] Error checking ${anime.title}:`, err)
      result.errors++
    }
  }

  // Phase 2: send emails with full available/unwatched context
  for (const { anime, sequel, type } of queue) {
    try {
    if (type === 'MONTH_START') {
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
        availableUnwatched: availableUnwatched.length > 0 ? availableUnwatched : undefined,
      })
      if (sent) {
        try {
          await recordNotification(sequel.id, 'MONTH_START', sequel.title.romaji, anime.title)
        } catch (recordErr) {
          console.error(
            `[check-updates] CRITICAL: email sent for ${sequel.title.romaji} (MONTH_START) but failed to record — will retry next run`,
            recordErr
          )
        }
        result.notified++
        result.notifications.push({ parent: anime.title, sequel: sequel.title.romaji, type: 'MONTH_START' })
      }
    } else {
      const sent = await sendDayBeforeEmail({
        parentTitle: anime.title,
        sequelTitle: sequel.title.romaji,
        startDate: sequel.startDate,
      })
      if (sent) {
        try {
          await recordNotification(sequel.id, 'DAY_BEFORE', sequel.title.romaji, anime.title)
        } catch (recordErr) {
          console.error(
            `[check-updates] CRITICAL: email sent for ${sequel.title.romaji} (DAY_BEFORE) but failed to record — will retry next run`,
            recordErr
          )
        }
        result.notified++
        result.notifications.push({ parent: anime.title, sequel: sequel.title.romaji, type: 'DAY_BEFORE' })
      }
    }
    } catch (err) {
      console.error(`[check-updates] Error sending notification for ${sequel.title.romaji}:`, err)
      result.errors++
    }
  }

  // If no new-season emails sent but available/unwatched exist — send standalone reminder
  if (result.notified === 0 && availableUnwatched.length > 0) {
    const sent = await sendAvailableSeasonsEmail({ available: availableUnwatched })
    if (sent) {
      result.notified++
      result.notifications.push({
        parent: '—',
        sequel: `${availableUnwatched.length} עונות זמינות`,
        type: 'AVAILABLE',
      })
    }
  }

  console.log(
    `[check-updates] Done — checked: ${result.checked}, notified: ${result.notified}, errors: ${result.errors}, available: ${availableUnwatched.length}`
  )
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
