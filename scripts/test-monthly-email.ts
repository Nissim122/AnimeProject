import { sendConsolidatedMonthlyEmail } from '../lib/mailer'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const mockSeasons = [
  { id: 101, status: 'FINISHED', title: { english: 'Season 1', romaji: 'Season 1' }, coverImage: { large: '' }, startDate: { year: 2022, month: 4, day: 1 } },
  { id: 102, status: 'RELEASING', title: { english: 'Season 2', romaji: 'Season 2' }, coverImage: { large: '' }, startDate: { year: 2024, month: 10, day: 5 } },
]

async function main() {
  const ok = await sendConsolidatedMonthlyEmail({
    toEmail: process.env.NOTIFY_EMAIL ?? 'nisimelec77@gmail.com',
    items: [
      {
        hebrewTitle: 'מדובר בזומבי? זה בלתי אפשרי',
        englishTitle: 'Is It Wrong to Try to Pick Up Girls in a Dungeon?',
        sequelTitle: 'Season 2',
        coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx113415-L2MNGhGUMBsg.jpg',
        status: 'RELEASING',
        nextAiringEpisode: { episode: 7, airingAt: Math.floor(Date.now() / 1000) + 86400 * 2 },
        upcomingEpisodes: [
          { episode: 7, airingAt: Math.floor(Date.now() / 1000) + 86400 * 2 },
          { episode: 8, airingAt: Math.floor(Date.now() / 1000) + 86400 * 9 },
        ],
        sequelEpisodeCount: 12,
        totalSeasons: 2,
        existingSeasonCount: 1,
        sequelId: 102,
        startDate: { year: 2024, month: 10, day: 5 },
        seasons: mockSeasons as never,
      },
      {
        hebrewTitle: 'ציד הגאון',
        englishTitle: 'Solo Leveling',
        sequelTitle: 'Season 2',
        coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx170942-YmmEnMfNvxqY.jpg',
        status: 'NOT_YET_RELEASED',
        nextAiringEpisode: null,
        upcomingEpisodes: [],
        sequelEpisodeCount: 13,
        totalSeasons: 2,
        existingSeasonCount: 1,
        sequelId: 170943,
        startDate: { year: 2025, month: 7, day: null },
        seasons: mockSeasons as never,
      },
    ],
    available: [
      {
        parentTitle: 'Demon Slayer: Kimetsu no Yaiba',
        sequelTitle: 'Demon Slayer Season 4',
        currentSeasonNumber: 3,
        totalSeasons: 4,
        anilistId: 166240,
        coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx166240-MN2hUVNpOUOo.jpg',
      },
    ],
  })

  console.log(ok ? '✅ מייל נשלח בהצלחה!' : '❌ שליחה נכשלה')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
