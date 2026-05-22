import { NextResponse } from 'next/server'
import { sendUpdatesEmail, type UpdatesEmailItem } from '@/lib/mailer'

interface SendUpdatesBody {
  watching: UpdatesEmailItem[]
  releasing: UpdatesEmailItem[]
  upcoming: UpdatesEmailItem[]
}

export async function POST(req: Request) {
  try {
    const body: SendUpdatesBody = await req.json()
    const sent = await sendUpdatesEmail(body)
    if (!sent) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 503 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-updates]', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
