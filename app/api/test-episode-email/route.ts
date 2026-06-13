import { NextResponse } from 'next/server'
import { sendNewEpisodeEmail } from '@/lib/mailer'

const ADMIN_EMAIL = process.env.NOTIFY_EMAIL ?? 'nisimelec77@gmail.com'

const now = Math.floor(Date.now() / 1000)
const hour = 3600
const day = 86400

const DUMMY_EPISODES = [
  {
    mediaId: 101922,
    title: 'Demon Slayer: Kimetsu no Yaiba',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-PEn1CTc93blC.jpg',
    episode: 12,
    airingAt: now - hour * 2,
    upcoming: [
      { episode: 13, airingAt: now + day * 7 },
      { episode: 14, airingAt: now + day * 14 },
    ],
  },
  {
    mediaId: 154587,
    title: 'Jujutsu Kaisen Season 3',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-AxpSiqFZsXKM.jpg',
    episode: 8,
    airingAt: now - hour * 5,
    upcoming: [
      { episode: 9, airingAt: now + day * 7 },
      { episode: 10, airingAt: now + day * 14 },
      { episode: 11, airingAt: now + day * 21 },
    ],
  },
  {
    mediaId: 170942,
    title: 'Solo Leveling Season 2',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-ik2jXDSPL0KR.jpg',
    episode: 5,
    airingAt: now - hour * 1,
    upcoming: [
      { episode: 6, airingAt: now + day * 7 },
    ],
  },
]

export async function GET() {
  const sent = await sendNewEpisodeEmail({
    newEpisodes: DUMMY_EPISODES,
    toEmail: ADMIN_EMAIL,
  })

  if (sent) {
    return NextResponse.json({ sent: true, to: ADMIN_EMAIL, episodes: DUMMY_EPISODES.length })
  }
  return NextResponse.json({ sent: false, reason: 'email config missing or send failed' }, { status: 500 })
}
