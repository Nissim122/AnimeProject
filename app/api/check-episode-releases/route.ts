import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { getAiringScheduleInRange, getAnimeAiringSchedule, withRateLimit } from '@/lib/anilist'
import { sendNewEpisodeEmail } from '@/lib/mailer'

export const maxDuration = 300

async function runEpisodeCheck() {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 25 * 3600
  const to = now

  // Fetch all globally aired episodes in the past 25 hours
  let aired
  try {
    aired = await withRateLimit(() => getAiringScheduleInRange(from, to))
  } catch (err) {
    console.error('[check-episode-releases] Failed to fetch airing schedule:', err)
    return { checked: 0, notified: 0, errors: 1 }
  }

  if (aired.length === 0) {
    console.log('[check-episode-releases] No episodes aired in range')
    return { checked: 0, notified: 0, errors: 0 }
  }

  // Build a set of aired mediaIds for quick lookup
  const airedByMediaId = new Map<number, typeof aired[0]>()
  for (const entry of aired) {
    // Keep the latest episode if multiple aired for the same series
    const existing = airedByMediaId.get(entry.mediaId)
    if (!existing || entry.episode > existing.episode) {
      airedByMediaId.set(entry.mediaId, entry)
    }
  }

  // Get all users who have tracked anime
  const userRows = await prisma.trackedAnime.findMany({
    select: { userId: true },
    distinct: ['userId'],
  })

  let totalNotified = 0
  let totalErrors = 0
  const clerk = await clerkClient()

  for (const { userId } of userRows) {
    try {
      const user = await clerk.users.getUser(userId)
      const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
      if (!email) continue

      // Get all tracked IDs + their known sequel IDs for this user
      const tracked = await prisma.trackedAnime.findMany({
        where: { userId },
        select: { anilistId: true, title: true, coverImage: true, knownSequels: { select: { sequelAnilistId: true } } },
      })

      // Build map: mediaId → parent title + cover
      const mediaToParent = new Map<number, { title: string; coverImage: string | null }>()
      for (const t of tracked) {
        mediaToParent.set(t.anilistId, { title: t.title, coverImage: t.coverImage })
        for (const s of (t.knownSequels ?? [])) {
          mediaToParent.set(s.sequelAnilistId, { title: t.title, coverImage: t.coverImage })
        }
      }

      // Filter aired episodes to this user's tracked series
      const relevantEntries = [...airedByMediaId.values()].filter((e) => mediaToParent.has(e.mediaId))
      if (relevantEntries.length === 0) continue

      // Batch dedup: one query for all relevant entries instead of N findUnique calls
      const existingSent = await prisma.sentNotification.findMany({
        where: {
          OR: relevantEntries.map((e) => ({
            userId,
            sequelAnilistId: e.mediaId,
            type: `EPISODE_${e.episode}`,
          })),
        },
        select: { sequelAnilistId: true, type: true },
      })
      const sentKeys = new Set(existingSent.map((n) => `${n.sequelAnilistId}_${n.type}`))

      const newEntries = relevantEntries.filter(
        (e) => !sentKeys.has(`${e.mediaId}_EPISODE_${e.episode}`)
      )
      if (newEntries.length === 0) continue

      // Fetch upcoming schedules in a single rate-limit context so 700ms spacing is enforced
      const toSend: Array<{
        mediaId: number
        title: string
        coverImage: string | null
        episode: number
        airingAt: number
        upcoming: Array<{ episode: number; airingAt: number }>
      }> = await withRateLimit(async () => {
        const results = []
        for (const entry of newEntries) {
          let upcoming: Array<{ episode: number; airingAt: number }> = []
          try {
            const schedule = await getAnimeAiringSchedule(entry.mediaId)
            upcoming = schedule.upcoming.slice(0, 3)
          } catch {
            // Non-fatal — send without upcoming
          }
          const parent = mediaToParent.get(entry.mediaId)!
          results.push({
            mediaId: entry.mediaId,
            title: entry.title,
            coverImage: parent.coverImage,
            episode: entry.episode,
            airingAt: entry.airingAt,
            upcoming,
          })
        }
        return results
      })

      try {
        const sent = await sendNewEpisodeEmail({ newEpisodes: toSend, toEmail: email })
        if (sent) {
          await prisma.sentNotification.createMany({
            data: toSend.map((ep) => ({
              userId,
              sequelAnilistId: ep.mediaId,
              type: `EPISODE_${ep.episode}`,
              sequelTitle: ep.title,
              parentTitle: ep.title,
            })),
            skipDuplicates: true,
          })
          totalNotified++
        }
      } catch (err) {
        console.error(`[check-episode-releases] Email failed for user ${userId}:`, err)
        totalErrors++
      }
    } catch (err) {
      console.error(`[check-episode-releases] Error processing user ${userId}:`, err)
      totalErrors++
    }
  }

  console.log(`[check-episode-releases] Done — notified: ${totalNotified}, errors: ${totalErrors}`)
  return { checked: userRows.length, notified: totalNotified, errors: totalErrors }
}

export async function GET() {
  try {
    const result = await runEpisodeCheck()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[check-episode-releases]', err)
    return NextResponse.json({ error: 'Episode check failed' }, { status: 500 })
  }
}
