import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { sendConsolidatedMonthlyEmail } from '@/lib/mailer'
import { translateToHebrew } from '@/lib/translate'

interface ReleasingInput {
  parentTitle: string
  coverImage?: string
  status: string
  nextTitle: string
  nextId: number
  startDate: { year: number | null; month: number | null; day: number | null }
}

interface AvailableInput {
  parentTitle: string
  sequelTitle: string
  anilistId: number
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
  if (!email) return NextResponse.json({ error: 'No email found' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    releasing?: ReleasingInput[]
    available?: AvailableInput[]
  }

  const releasing = body.releasing ?? []
  const available = body.available ?? []

  if (releasing.length === 0 && available.length === 0) {
    return NextResponse.json({ sent: false, reason: 'nothing_to_send' })
  }

  const items: Parameters<typeof sendConsolidatedMonthlyEmail>[0]['items'] = []
  for (const item of releasing) {
    const hebrewTitle = await translateToHebrew(item.nextTitle).catch(() => item.nextTitle)
    items.push({
      hebrewTitle,
      englishTitle: item.nextTitle,
      sequelTitle: item.nextTitle,
      coverImage: item.coverImage,
      status: item.status,
      nextAiringEpisode: null,
      sequelEpisodeCount: null,
      totalSeasons: undefined,
      sequelId: item.nextId,
      startDate: item.startDate,
      seasons: [],
    })
  }

  const sent = await sendConsolidatedMonthlyEmail({
    items,
    available: available.length > 0 ? available : undefined,
    toEmail: email,
  })

  return NextResponse.json({ sent })
}
