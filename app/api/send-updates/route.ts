import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { sendConsolidatedMonthlyEmail } from '@/lib/mailer'
import type { AnimeResult } from '@/lib/anilist'

interface SendUpdatesItem {
  title: string
  coverImage?: string
  sequelTitle: string
  sequelId: number
  startDate: { year: number | null; month: number | null; day: number | null }
}

interface SendUpdatesBody {
  releasing: SendUpdatesItem[]
  upcoming: SendUpdatesItem[]
  available: Array<{ parentTitle: string; sequelTitle: string }>
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
    if (!email) return NextResponse.json({ error: 'No email found' }, { status: 400 })

    const body: SendUpdatesBody = await req.json()
    const { releasing, upcoming, available } = body

    const items = [
      ...releasing.map((r) => ({
        hebrewTitle: r.title,
        englishTitle: r.title,
        sequelTitle: r.sequelTitle,
        coverImage: r.coverImage,
        status: 'RELEASING',
        sequelId: r.sequelId,
        startDate: r.startDate,
        seasons: [] as AnimeResult[],
      })),
      ...upcoming.map((u) => ({
        hebrewTitle: u.title,
        englishTitle: u.title,
        sequelTitle: u.sequelTitle,
        coverImage: u.coverImage,
        status: 'NOT_YET_RELEASED',
        sequelId: u.sequelId,
        startDate: u.startDate,
        seasons: [] as AnimeResult[],
      })),
    ]

    if (items.length === 0 && available.length === 0) {
      return NextResponse.json({ ok: false })
    }

    const sent = await sendConsolidatedMonthlyEmail({
      items,
      available: available.length > 0 ? available : undefined,
      toEmail: email,
    })

    return NextResponse.json({ ok: sent })
  } catch (err) {
    console.error('[send-updates]', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
