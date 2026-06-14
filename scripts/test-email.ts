import { PrismaClient } from '@prisma/client'
import { sendUpdatesEmail } from '../lib/mailer'

const p = new PrismaClient()

async function main() {
  const tracked = await p.trackedAnime.findMany({ take: 10 })
  await p.$disconnect()

  console.log('Tracked anime in DB:', tracked.length)
  tracked.forEach(a => console.log(` - [${a.watchStatus}] ${a.title} (id: ${a.anilistId})`))

  const watching = tracked
    .filter(a => a.watchStatus === 'watching')
    .slice(0, 3)
    .map(a => ({
      parentTitle: a.title,
      coverImage: a.coverImage ?? undefined,
      sequelTitle: '',
      currentSeasonNum: 1 as number | null,
      totalSeasons: 3 as number | null,
    }))

  const upcoming = tracked
    .filter(a => a.watchStatus === 'completed')
    .slice(0, 2)
    .map((a, i) => ({
      parentTitle: a.title,
      coverImage: a.coverImage ?? undefined,
      startDate: { year: 2025, month: 7 + i, day: null as null },
      seasonNumber: 2 as number | null,
      existingSeasonCount: 1,
      episodeCount: 12 as number | null,
    }))

  const releasing = tracked
    .filter(a => a.watchStatus === 'completed')
    .slice(2, 4)
    .map(a => ({
      parentTitle: a.title,
      coverImage: a.coverImage ?? undefined,
      upcomingEpisodes: [
        { episode: 8, airingAt: Math.floor(Date.now() / 1000) + 3600 },
        { episode: 9, airingAt: Math.floor(Date.now() / 1000) + 3600 * 24 * 7 },
      ],
    }))

  if (watching.length === 0 && upcoming.length === 0 && releasing.length === 0) {
    console.log('No data — using dummy data')
    watching.push({ parentTitle: 'Demon Slayer', coverImage: undefined, sequelTitle: '', currentSeasonNum: 2, totalSeasons: 4 })
    upcoming.push({ parentTitle: 'Jujutsu Kaisen', coverImage: undefined, startDate: { year: 2025, month: 10, day: null }, seasonNumber: 3, existingSeasonCount: 2, episodeCount: 24 })
    releasing.push({ parentTitle: 'Solo Leveling', coverImage: undefined, upcomingEpisodes: [{ episode: 6, airingAt: Math.floor(Date.now() / 1000) + 3600 }] })
  }

  const toEmail = process.env.NOTIFY_EMAIL || 'nisimelec77@gmail.com'
  console.log(`\nSending to: ${toEmail}`)
  console.log(`Sections: ${releasing.length} releasing, ${upcoming.length} upcoming, ${watching.length} watching`)

  const sent = await sendUpdatesEmail({ watching, releasing, upcoming, toEmail })
  console.log(sent ? '✓ Email sent' : '✗ Failed')
}

main().catch(console.error)
