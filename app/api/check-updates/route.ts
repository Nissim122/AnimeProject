import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels, getAnimeStatusWithSequels, getAllSeasons, delay, RelationNode } from '@/lib/anilist'
import { sendMonthStartEmail, sendDayBeforeEmail, sendAvailableSeasonsEmail } from '@/lib/mailer'
import { translateToHebrew } from '@/lib/translate'

export interface PendingNotification {
  animeId: number
  animeTitle: string
  animeCoverImage?: string
  sequelId: number
  sequelTitle: string
  type: 'MONTH_START' | 'DAY_BEFORE'
  startDate: RelationNode['startDate']
  status: string
}

export interface CheckOnlyResult {
  checked: number
  errors: number
  releasingAnimes: Array<{ id: number; title: string; coverImage?: string }>
  availableSequels: Array<{ parentTitle: string; sequelTitle: string; sequelId: number }>
  pendingNotifications: PendingNotification[]
  availableUnwatched: Array<{ parentTitle: string; sequelTitle: string }>
}

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

export async function hasSentNotification(sequelId: number, type: string): Promise<boolean> {
  const existing = await prisma.sentNotification.findUnique({
    where: { sequelAnilistId_type: { sequelAnilistId: sequelId, type } },
  })
  return !!existing
}

export async function recordNotification(
  sequelId: number,
  type: string,
  sequelTitle: string,
  parentTitle: string
): Promise<void> {
  await prisma.sentNotification.create({
    data: { sequelAnilistId: sequelId, type, sequelTitle, parentTitle },
  })
}

// Phase 1: fetch all data from AniList, build queues — shared between check-only and full check+send
async function collectCheckData(): Promise<CheckOnlyResult & { _queue: PendingNotification[] }> {
  const tracked = await prisma.trackedAnime.findMany({ include: { knownSequels: true } })
  const trackedIdsSet = new Set(tracked.map((a) => a.anilistId))

  let checked = 0
  let errors = 0
  const releasingAnimes: CheckOnlyResult['releasingAnimes'] = []
  const availableSequels: CheckOnlyResult['availableSequels'] = []
  const pendingNotifications: PendingNotification[] = []
  const availableUnwatched: CheckOnlyResult['availableUnwatched'] = []
  const seenAvailableIds = new Set<number>()
  const seenReleasingIds = new Set<number>()

  for (const anime of tracked) {
    checked++
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
        if (!seenReleasingIds.has(anime.anilistId)) {
          seenReleasingIds.add(anime.anilistId)
          releasingAnimes.push({ id: anime.anilistId, title: anime.title, coverImage: anime.coverImage ?? undefined })
        }
      }

      for (const s of directSequels) {
        if (!seenSequelIds.has(s.id)) { seenSequelIds.add(s.id); allSequels.push(s) }
      }

      const collectAvailable = (sequels: RelationNode[], label: string) => {
        for (const s of sequels) {
          if (s.status === 'FINISHED' && !trackedIdsSet.has(s.id) && !seenAvailableIds.has(s.id)) {
            seenAvailableIds.add(s.id)
            availableUnwatched.push({ parentTitle: label, sequelTitle: s.title.romaji })
            availableSequels.push({ parentTitle: label, sequelTitle: s.title.romaji, sequelId: s.id })
          }
        }
      }

      collectAvailable(directSequels, anime.title)

      for (const knownId of knownIds) {
        await delay(700)
        const sequels = await getAnimeSequels(knownId)
        for (const s of sequels) {
          if (!seenSequelIds.has(s.id)) { seenSequelIds.add(s.id); allSequels.push(s) }
        }
        collectAvailable(sequels, anime.title)
      }

      for (const sequel of allSequels) {
        if (sequel.status !== 'RELEASING' && sequel.status !== 'NOT_YET_RELEASED') continue

        const qualifiesForMonthStart =
          sequel.status === 'RELEASING' ||
          (sequel.status === 'NOT_YET_RELEASED' && isCurrentMonth(sequel.startDate))

        if (qualifiesForMonthStart && !(await hasSentNotification(sequel.id, 'MONTH_START'))) {
          pendingNotifications.push({
            animeId: anime.anilistId,
            animeTitle: anime.title,
            animeCoverImage: anime.coverImage ?? undefined,
            sequelId: sequel.id,
            sequelTitle: sequel.title.romaji,
            type: 'MONTH_START',
            startDate: sequel.startDate,
            status: sequel.status,
          })
        }

        if (
          sequel.status === 'NOT_YET_RELEASED' &&
          isTomorrow(sequel.startDate) &&
          !(await hasSentNotification(sequel.id, 'DAY_BEFORE'))
        ) {
          pendingNotifications.push({
            animeId: anime.anilistId,
            animeTitle: anime.title,
            animeCoverImage: anime.coverImage ?? undefined,
            sequelId: sequel.id,
            sequelTitle: sequel.title.romaji,
            type: 'DAY_BEFORE',
            startDate: sequel.startDate,
            status: sequel.status,
          })
        }
      }
    } catch (err) {
      console.error(`[check-updates] Error checking ${anime.title}:`, err)
      errors++
    }
  }

  return { checked, errors, releasingAnimes, availableSequels, pendingNotifications, availableUnwatched, _queue: pendingNotifications }
}

// Used by button (check only, no emails)
export async function runCheckOnly(): Promise<CheckOnlyResult> {
  const data = await collectCheckData()
  console.log(`[check-updates] Check only — checked: ${data.checked}, pending: ${data.pendingNotifications.length}, available: ${data.availableUnwatched.length}`)
  return {
    checked: data.checked,
    errors: data.errors,
    releasingAnimes: data.releasingAnimes,
    availableSequels: data.availableSequels,
    pendingNotifications: data.pendingNotifications,
    availableUnwatched: data.availableUnwatched,
  }
}

// Used by cron (check + send emails)
export async function runUpdateCheck(): Promise<UpdateResult> {
  const data = await collectCheckData()
  const result: UpdateResult = { checked: data.checked, notified: 0, errors: data.errors, notifications: [] }

  for (const item of data._queue) {
    try {
      if (item.type === 'MONTH_START') {
        const allSeasons = await getAllSeasons(item.animeId)
        const baseTitle = allSeasons[0]?.title.english ?? allSeasons[0]?.title.romaji ?? item.animeTitle
        const hebrewTitle = await translateToHebrew(baseTitle).catch(() => baseTitle)
        const englishTitle = allSeasons[0]?.title.english ?? allSeasons[0]?.title.romaji ?? item.animeTitle

        const sent = await sendMonthStartEmail({
          hebrewTitle,
          englishTitle,
          sequelId: item.sequelId,
          sequelTitle: item.sequelTitle,
          startDate: item.startDate,
          status: item.status,
          seasons: allSeasons,
          availableUnwatched: data.availableUnwatched.length > 0 ? data.availableUnwatched : undefined,
        })
        if (sent) {
          try { await recordNotification(item.sequelId, 'MONTH_START', item.sequelTitle, item.animeTitle) }
          catch (e) { console.error(`[check-updates] CRITICAL: failed to record MONTH_START for ${item.sequelTitle}`, e) }
          result.notified++
          result.notifications.push({ parent: item.animeTitle, sequel: item.sequelTitle, type: 'MONTH_START' })
        }
      } else {
        const sent = await sendDayBeforeEmail({
          parentTitle: item.animeTitle,
          sequelTitle: item.sequelTitle,
          startDate: item.startDate,
        })
        if (sent) {
          try { await recordNotification(item.sequelId, 'DAY_BEFORE', item.sequelTitle, item.animeTitle) }
          catch (e) { console.error(`[check-updates] CRITICAL: failed to record DAY_BEFORE for ${item.sequelTitle}`, e) }
          result.notified++
          result.notifications.push({ parent: item.animeTitle, sequel: item.sequelTitle, type: 'DAY_BEFORE' })
        }
      }
    } catch (err) {
      console.error(`[check-updates] Error sending notification for ${item.sequelTitle}:`, err)
      result.errors++
    }
  }

  if (result.notified === 0 && data.availableUnwatched.length > 0) {
    const sent = await sendAvailableSeasonsEmail({ available: data.availableUnwatched })
    if (sent) {
      result.notified++
      result.notifications.push({ parent: '—', sequel: `${data.availableUnwatched.length} עונות זמינות`, type: 'AVAILABLE' })
    }
  }

  console.log(`[check-updates] Done — checked: ${result.checked}, notified: ${result.notified}, errors: ${result.errors}`)
  return result
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { sendEmails?: boolean }
    // cron calls without body → sendEmails defaults to true
    const sendEmails = body.sendEmails !== false
    if (sendEmails) {
      const result = await runUpdateCheck()
      return NextResponse.json(result)
    }
    const result = await runCheckOnly()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[check-updates]', err)
    return NextResponse.json({ error: 'Update check failed' }, { status: 500 })
  }
}
