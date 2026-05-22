import { NextResponse } from 'next/server'
import { getAllSeasons } from '@/lib/anilist'
import { sendMonthStartEmail, sendDayBeforeEmail, sendAvailableSeasonsEmail } from '@/lib/mailer'
import { translateToHebrew } from '@/lib/translate'
import { hasSentNotification, recordNotification, PendingNotification } from '@/app/api/check-updates/route'

interface SendRequest {
  pendingNotifications: PendingNotification[]
  availableUnwatched: Array<{ parentTitle: string; sequelTitle: string }>
}

export interface SendResult {
  notified: number
  errors: number
  notifications: Array<{ parent: string; sequel: string; type: string }>
}

export async function POST(req: Request) {
  try {
    const { pendingNotifications, availableUnwatched }: SendRequest = await req.json()
    const result: SendResult = { notified: 0, errors: 0, notifications: [] }

    for (const item of pendingNotifications) {
      try {
        if (item.type === 'MONTH_START') {
          // Re-check in case it was sent since the check was done
          if (await hasSentNotification(item.sequelId, 'MONTH_START')) continue

          const allSeasons = await getAllSeasons(item.animeId)
          const baseTitle = allSeasons[0]?.title.english ?? allSeasons[0]?.title.romaji ?? item.animeTitle
          const hebrewTitle = await translateToHebrew(baseTitle).catch(() => baseTitle)
          const englishTitle = allSeasons[0]?.title.english ?? allSeasons[0]?.title.romaji ?? item.animeTitle

          const sent = await sendMonthStartEmail({
            hebrewTitle,
            englishTitle,
            sequelId: item.sequelId,
            sequelTitle: item.sequelTitle,
            startDate: item.startDate,
            status: item.status,
            seasons: allSeasons,
            availableUnwatched: availableUnwatched.length > 0 ? availableUnwatched : undefined,
          })
          if (sent) {
            try { await recordNotification(item.sequelId, 'MONTH_START', item.sequelTitle, item.animeTitle) }
            catch (e) { console.error(`[send-notifications] Failed to record MONTH_START for ${item.sequelTitle}`, e) }
            result.notified++
            result.notifications.push({ parent: item.animeTitle, sequel: item.sequelTitle, type: 'MONTH_START' })
          }
        } else {
          if (await hasSentNotification(item.sequelId, 'DAY_BEFORE')) continue

          const sent = await sendDayBeforeEmail({
            parentTitle: item.animeTitle,
            sequelTitle: item.sequelTitle,
            startDate: item.startDate,
          })
          if (sent) {
            try { await recordNotification(item.sequelId, 'DAY_BEFORE', item.sequelTitle, item.animeTitle) }
            catch (e) { console.error(`[send-notifications] Failed to record DAY_BEFORE for ${item.sequelTitle}`, e) }
            result.notified++
            result.notifications.push({ parent: item.animeTitle, sequel: item.sequelTitle, type: 'DAY_BEFORE' })
          }
        }
      } catch (err) {
        console.error(`[send-notifications] Error for ${item.sequelTitle}:`, err)
        result.errors++
      }
    }

    if (result.notified === 0 && availableUnwatched.length > 0) {
      const sent = await sendAvailableSeasonsEmail({ available: availableUnwatched })
      if (sent) {
        result.notified++
        result.notifications.push({ parent: '—', sequel: `${availableUnwatched.length} עונות זמינות`, type: 'AVAILABLE' })
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[send-notifications]', err)
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 })
  }
}
