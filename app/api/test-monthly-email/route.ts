import { NextResponse } from 'next/server'
import { sendConsolidatedMonthlyEmail } from '@/lib/mailer'
import type { AnimeResult } from '@/lib/anilist'

const ADMIN_EMAIL = process.env.NOTIFY_EMAIL ?? 'nisimelec77@gmail.com'

const now = Math.floor(Date.now() / 1000)
const day = 86400

const demonSlayerSeasons: AnimeResult[] = [
  { id: 101922, title: { romaji: 'Kimetsu no Yaiba', english: 'Demon Slayer' }, coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-PEn1CTc93blC.jpg' }, status: 'FINISHED', seasonYear: 2019, season: 'SPRING', format: 'TV', popularity: 320000, episodes: 26, startDate: { year: 2019, month: 4, day: 6 } },
  { id: 142329, title: { romaji: 'Kimetsu no Yaiba: Yuukaku-hen', english: 'Demon Slayer: Entertainment District Arc' }, coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx142329-HmLdGDAoFqVC.jpg' }, status: 'FINISHED', seasonYear: 2021, season: 'FALL', format: 'TV', popularity: 280000, episodes: 11, startDate: { year: 2021, month: 12, day: 5 } },
  { id: 154587, title: { romaji: 'Kimetsu no Yaiba: Katanakaji no Sato-hen', english: 'Demon Slayer: Swordsmith Village Arc' }, coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-AxpSiqFZsXKM.jpg' }, status: 'RELEASING', seasonYear: 2023, season: 'SPRING', format: 'TV', popularity: 260000, episodes: 11, nextAiringEpisode: { episode: 9, airingAt: now + day * 4 }, startDate: { year: 2023, month: 4, day: 9 } },
]

const soloLevelingSeasons: AnimeResult[] = [
  { id: 151807, title: { romaji: 'Solo Leveling', english: 'Solo Leveling' }, coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-0NRkbUHOXfBB.jpg' }, status: 'FINISHED', seasonYear: 2024, season: 'WINTER', format: 'TV', popularity: 210000, episodes: 12, startDate: { year: 2024, month: 1, day: 7 } },
  { id: 170942, title: { romaji: 'Solo Leveling Season 2', english: 'Solo Leveling Season 2: Arise from the Shadow' }, coverImage: { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-ik2jXDSPL0KR.jpg' }, status: 'NOT_YET_RELEASED', seasonYear: 2026, season: 'WINTER', format: 'TV', popularity: 180000, episodes: 13, startDate: { year: 2026, month: 1, day: null } },
]

const DUMMY_ITEMS: Parameters<typeof sendConsolidatedMonthlyEmail>[0]['items'] = [
  {
    hebrewTitle: 'קוצר שדים: עמק הסייפים',
    englishTitle: 'Demon Slayer: Swordsmith Village Arc',
    sequelTitle: 'Kimetsu no Yaiba: Katanakaji no Sato-hen',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-AxpSiqFZsXKM.jpg',
    status: 'RELEASING',
    nextAiringEpisode: { episode: 9, airingAt: now + day * 4 },
    sequelEpisodeCount: 11,
    totalSeasons: demonSlayerSeasons.length,
    sequelId: 154587,
    startDate: { year: 2023, month: 4, day: 9 },
    seasons: demonSlayerSeasons,
  },
  {
    hebrewTitle: 'Solo Leveling עונה 2',
    englishTitle: 'Solo Leveling Season 2: Arise from the Shadow',
    sequelTitle: 'Solo Leveling Season 2',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-ik2jXDSPL0KR.jpg',
    status: 'NOT_YET_RELEASED',
    nextAiringEpisode: null,
    sequelEpisodeCount: 13,
    totalSeasons: soloLevelingSeasons.length,
    sequelId: 170942,
    startDate: { year: 2026, month: 1, day: null },
    seasons: soloLevelingSeasons,
  },
]

const DUMMY_AVAILABLE = [
  {
    parentTitle: 'Attack on Titan',
    sequelTitle: 'Attack on Titan: The Final Season',
    currentSeasonNumber: 4,
    totalSeasons: 4,
    anilistId: 110277,
  },
]

export async function GET() {
  const sent = await sendConsolidatedMonthlyEmail({
    items: DUMMY_ITEMS,
    available: DUMMY_AVAILABLE,
    toEmail: ADMIN_EMAIL,
  })

  if (sent) {
    return NextResponse.json({ sent: true, to: ADMIN_EMAIL })
  }
  return NextResponse.json({ sent: false, reason: 'email config missing or send failed' }, { status: 500 })
}
