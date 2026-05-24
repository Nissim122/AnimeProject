import 'dotenv/config'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load .env.local first
config({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '@prisma/client'
import { getAllSeasons, getAnimeStatusWithSequels, delay } from '../lib/anilist'
import { sendConsolidatedMonthlyEmail } from '../lib/mailer'

const prisma = new PrismaClient()

async function main() {
  const userId = process.argv[2]
  const toEmail = process.env.NOTIFY_EMAIL ?? 'nisimelec77@gmail.com'

  console.log('Fetching tracked anime...')
  const tracked = await prisma.trackedAnime.findMany({
    where: userId ? { userId } : undefined,
    include: { knownSequels: true },
    take: 20,
  })

  if (tracked.length === 0) {
    console.log('No tracked anime found.')
    await prisma.$disconnect()
    return
  }

  console.log(`Found ${tracked.length} tracked anime:`, tracked.map(a => a.title).join(', '))

  const items: Parameters<typeof sendConsolidatedMonthlyEmail>[0]['items'] = []

  for (const anime of tracked.slice(0, 8)) {
    try {
      console.log(`Fetching seasons for: ${anime.title}`)
      await delay(700)
      const seasons = await getAllSeasons(anime.anilistId)
      const { status, startDate } = await getAnimeStatusWithSequels(anime.anilistId)

      const baseTitle = seasons[0]?.title.english ?? seasons[0]?.title.romaji ?? anime.title
      const currentEntry = seasons.find(s => s.id === anime.anilistId)

      items.push({
        hebrewTitle: anime.title,
        englishTitle: baseTitle,
        sequelTitle: currentEntry?.title.romaji ?? anime.title,
        coverImage: currentEntry?.coverImage?.large ?? anime.coverImage ?? undefined,
        status: status,
        nextAiringEpisode: currentEntry?.nextAiringEpisode ?? null,
        sequelEpisodeCount: currentEntry?.episodes ?? null,
        totalSeasons: seasons.length,
        sequelId: anime.anilistId,
        startDate: startDate,
        seasons,
      })
    } catch (err) {
      console.error(`Error fetching ${anime.title}:`, err)
    }
  }

  if (items.length === 0) {
    console.log('No items to send.')
    await prisma.$disconnect()
    return
  }

  console.log(`Sending test email to ${toEmail} with ${items.length} items...`)
  const sent = await sendConsolidatedMonthlyEmail({ items, toEmail })
  console.log(sent ? '✓ Email sent successfully!' : '✗ Failed to send email.')

  await prisma.$disconnect()
}

main().catch(console.error)
