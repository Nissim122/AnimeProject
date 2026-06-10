import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { sendUpdatesEmail } from '@/lib/mailer'

interface StartDate { year: number | null; month: number | null; day: number | null }

interface WatchingInput  { parentTitle: string; coverImage?: string; sequelTitle: string }
interface ReleasingInput { parentTitle: string; coverImage?: string; upcomingEpisodes?: { episode: number; airingAt: number }[] }
interface UpcomingInput  { parentTitle: string; coverImage?: string; startDate: StartDate }

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clerk = await clerkClient()
  const user = await clerk.users.getUser(userId)
  const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
  if (!email) return NextResponse.json({ error: 'No email found' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    watching?: WatchingInput[]
    releasing?: ReleasingInput[]
    upcoming?: UpcomingInput[]
  }

  const watching  = body.watching  ?? []
  const releasing = body.releasing ?? []
  const upcoming  = body.upcoming  ?? []

  if (watching.length === 0 && releasing.length === 0 && upcoming.length === 0) {
    return NextResponse.json({ sent: false, reason: 'nothing_to_send' })
  }

  const sent = await sendUpdatesEmail({ watching, releasing, upcoming, toEmail: email })
  return NextResponse.json({ sent })
}
