import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getAnimeSequels, getAnimeStatusWithSequels, batchGetAnimeStatus, getAllSeasons, delay, withRateLimit, RelationNode } from '@/lib/anilist'
import { sendConsolidatedMonthlyEmail } from '@/lib/mailer'
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
  nextAiringEpisode?: { episode: number; airingAt: number } | null
  sequelEpisodeCount?: number | null
}

export interface CheckOnlyResult {
  checked: number
  errors: number
  releasingAnimes: Array<{ id: number; title: string; coverImage?: string }>
  availableSequels: Array<{ parentTitle: string; sequelTitle: string; sequelId: number }>
  pendingNotifications: PendingNotification[]
  availableUnwatched: Array<{ parentTitle: string; sequelTitle: string; sequelId: number }>
}

export interface UpdateResult {
  checked: number
  notified: number
  errors: number
  notifications: Array<{ parent: string; sequel: string; type: string }>
}

async function fetchSentNotificationKeys(userId: string): Promise<Set<string>> {
  const rows = await prisma.sentNotification.findMany({
    where: { userId },
    select: { sequelAnilistId: true, type: true },
  })
  return new Set(rows.map((r) => `${r.sequelAnilistId}_${r.type}`))
}

async function collectCheckDataForUser(userId: string): Promise<CheckOnlyResult & { _queue: PendingNotification[] }> {
  return withRateLimit(() => _collectCheckDataForUser(userId))
}

async function _collectCheckDataForUser(userId: string): Promise<CheckOnlyResult & { _queue: PendingNotification[] }> {
  const [tracked, sentKeys] = await Promise.all([
    prisma.trackedAnime.findMany({ where: { userId }, include: { knownSequels: true } }),
    fetchSentNotificationKeys(userId),
  ])
  const trackedIdsSet = new Set(tracked.map((a) => a.anilistId))

  // Pre-fetch all anime statuses in one batch (AniList Page allows up to 50 per request)
  type StatusEntry = { status: string; startDate: { year: number | null; month: number | null; day: number | null }; sequels: RelationNode[] }
  const statusBatchMap = new Map<number, StatusEntry>()
  const allTrackedIds = tracked.map((a) => a.anilistId)
  for (let i = 0; i < allTrackedIds.length; i += 50) {
    try {
      const chunk = await batchGetAnimeStatus(allTrackedIds.slice(i, i + 50))
      for (const [id, data] of chunk) statusBatchMap.set(id, data)
    } catch {
      // Partial batch failure — missing IDs will fall back to individual calls in the loop
    }
  }

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
    let succeeded = false
    for (let attempt = 0; attempt <= 1 && !succeeded; attempt++) {
      if (attempt > 0) await delay(4000)
      try {
        const knownIds = new Set(anime.knownSequels.map((s) => s.sequelAnilistId))
        const allSequels: RelationNode[] = []
        const seenSequelIds = new Set<number>()

        let statusResult = statusBatchMap.get(anime.anilistId)
        if (!statusResult) {
          await delay(700)
          statusResult = await getAnimeStatusWithSequels(anime.anilistId)
        }
        const { status: selfStatus, startDate: selfStartDate, sequels: directSequels } = statusResult
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
              availableUnwatched.push({ parentTitle: label, sequelTitle: s.title.romaji, sequelId: s.id })
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
          if (!sentKeys.has(`${sequel.id}_MONTH_START`)) {
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
        }

        succeeded = true
      } catch (err) {
        if (attempt === 1) {
          console.error(`[check-updates] Error checking ${anime.title}:`, err)
          errors++
        }
      }
    }
  }

  return { checked, errors, releasingAnimes, availableSequels, pendingNotifications, availableUnwatched, _queue: pendingNotifications }
}

export async function runCheckOnly(userId: string): Promise<CheckOnlyResult> {
  const data = await collectCheckDataForUser(userId)
  console.log(`[check-updates] Check only (user ${userId}) — checked: ${data.checked}, pending: ${data.pendingNotifications.length}`)
  return {
    checked: data.checked,
    errors: data.errors,
    releasingAnimes: data.releasingAnimes,
    availableSequels: data.availableSequels,
    pendingNotifications: data.pendingNotifications,
    availableUnwatched: data.availableUnwatched,
  }
}

async function runUpdateCheckForUser(userId: string, toEmail: string): Promise<UpdateResult> {
  const data = await collectCheckDataForUser(userId)
  const result: UpdateResult = { checked: data.checked, notified: 0, errors: data.errors, notifications: [] }

  if (data._queue.length === 0 && data.availableUnwatched.length === 0) return result

  const seasonsCache = new Map<number, Awaited<ReturnType<typeof getAllSeasons>>>()
  const getSeasons = async (id: number) => {
    if (!seasonsCache.has(id)) seasonsCache.set(id, await getAllSeasons(id))
    return seasonsCache.get(id)!
  }

  type ConsolidatedItem = {
    hebrewTitle: string; englishTitle: string; sequelTitle: string; coverImage?: string
    status: string; nextAiringEpisode?: { episode: number; airingAt: number } | null
    sequelEpisodeCount?: number | null; totalSeasons?: number; sequelId: number
    startDate: { year: number | null; month: number | null; day: number | null }
    seasons: Awaited<ReturnType<typeof getAllSeasons>>
  }
  const consolidatedItems: ConsolidatedItem[] = []
  const recordQueue: Array<{ sequelId: number; type: string; sequelTitle: string; animeTitle: string }> = []

  for (const item of data._queue) {
    try {
      const allSeasons = await getSeasons(item.animeId)
      const sequelEntry = allSeasons.find((s) => s.id === item.sequelId)
      const sequelBaseTitle = sequelEntry?.title.english ?? sequelEntry?.title.romaji ?? item.sequelTitle
      const hebrewTitle = await translateToHebrew(sequelBaseTitle).catch(() => sequelBaseTitle)
      const englishTitle = sequelEntry?.title.english ?? sequelEntry?.title.romaji ?? item.sequelTitle
      consolidatedItems.push({
        hebrewTitle, englishTitle,
        sequelTitle: item.sequelTitle,
        coverImage: sequelEntry?.coverImage?.large ?? item.animeCoverImage,
        status: item.status,
        nextAiringEpisode: sequelEntry?.nextAiringEpisode ?? null,
        sequelEpisodeCount: sequelEntry?.episodes ?? null,
        totalSeasons: allSeasons.length,
        sequelId: item.sequelId,
        startDate: item.startDate,
        seasons: allSeasons,
      })
      recordQueue.push({ sequelId: item.sequelId, type: item.type, sequelTitle: item.sequelTitle, animeTitle: item.animeTitle })
    } catch (err) {
      console.error(`[check-updates] Error preparing ${item.sequelTitle}:`, err)
      result.errors++
    }
  }

  const enrichedAvailable: Array<{ parentTitle: string; sequelTitle: string; currentSeasonNumber?: number; totalSeasons?: number; anilistId?: number }> = []
  for (const item of data.availableUnwatched) {
    try {
      const seasons = await getSeasons(item.sequelId)
      const sequelIndex = seasons.findIndex((s) => s.id === item.sequelId)
      enrichedAvailable.push({
        parentTitle: item.parentTitle,
        sequelTitle: item.sequelTitle,
        currentSeasonNumber: sequelIndex > 0 ? sequelIndex : undefined,
        totalSeasons: seasons.length > 0 ? seasons.length : undefined,
        anilistId: item.sequelId,
      })
    } catch {
      enrichedAvailable.push({ parentTitle: item.parentTitle, sequelTitle: item.sequelTitle, anilistId: item.sequelId })
    }
  }

  if (consolidatedItems.length === 0 && enrichedAvailable.length === 0) return result

  try {
    const sent = await sendConsolidatedMonthlyEmail({
      items: consolidatedItems,
      available: enrichedAvailable.length > 0 ? enrichedAvailable : undefined,
      toEmail,
    })
    if (sent) {
      if (recordQueue.length > 0) {
        try {
          await prisma.sentNotification.createMany({
            data: recordQueue.map((rec) => ({
              userId,
              sequelAnilistId: rec.sequelId,
              type: rec.type,
              sequelTitle: rec.sequelTitle,
              parentTitle: rec.animeTitle,
            })),
            skipDuplicates: true,
          })
        } catch (e) {
          console.error('[check-updates] CRITICAL: failed to record notifications batch', e)
        }
      }
      result.notified = 1
      result.notifications = [
        ...consolidatedItems.map((i) => ({ parent: i.hebrewTitle, sequel: i.sequelTitle, type: 'CONSOLIDATED' })),
        ...(enrichedAvailable.length > 0 ? [{ parent: '—', sequel: `${enrichedAvailable.length} עונות זמינות`, type: 'AVAILABLE' }] : []),
      ]
    }
  } catch (err) {
    console.error('[check-updates] Error sending consolidated email:', err)
    result.errors++
  }

  return result
}

// Cron: runs for all users
export async function runUpdateCheck(): Promise<UpdateResult> {
  const userRows = await prisma.trackedAnime.findMany({
    select: { userId: true },
    distinct: ['userId'],
  })

  const totals: UpdateResult = { checked: 0, notified: 0, errors: 0, notifications: [] }
  const clerk = await clerkClient()

  for (const { userId } of userRows) {
    try {
      const user = await clerk.users.getUser(userId)
      const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
      if (!email) {
        console.warn(`[check-updates] No email for user ${userId}, skipping`)
        continue
      }
      const result = await runUpdateCheckForUser(userId, email)
      totals.checked += result.checked
      totals.notified += result.notified
      totals.errors += result.errors
      totals.notifications.push(...result.notifications)
    } catch (err) {
      console.error(`[check-updates] Error processing user ${userId}:`, err)
      totals.errors++
    }
  }

  console.log(`[check-updates] Done — checked: ${totals.checked}, notified: ${totals.notified}, errors: ${totals.errors}`)
  return totals
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { sendEmails?: boolean; userOnly?: boolean }
    const sendEmails = body.sendEmails !== false

    if (sendEmails && body.userOnly) {
      // Manual send from UI — logged-in user only
      const { userId } = await auth()
      if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const clerk = await clerkClient()
      const user = await clerk.users.getUser(userId)
      const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
      if (!email) return NextResponse.json({ error: 'No email found' }, { status: 400 })
      const result = await runUpdateCheckForUser(userId, email)
      return NextResponse.json(result)
    }

    if (sendEmails) {
      const result = await runUpdateCheck()
      return NextResponse.json(result)
    }

    // check-only from UI button — requires logged-in user
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const result = await runCheckOnly(userId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[check-updates]', err)
    return NextResponse.json({ error: 'Update check failed' }, { status: 500 })
  }
}

// Cron GET
export async function GET() {
  try {
    const result = await runUpdateCheck()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[check-updates]', err)
    return NextResponse.json({ error: 'Update check failed' }, { status: 500 })
  }
}
