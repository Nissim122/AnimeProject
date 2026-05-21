import nodemailer from 'nodemailer'

function createTransport() {
  const user = process.env.EMAIL_USER
  const pass = process.env.EMAIL_PASS
  if (!user || !pass) return null

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

function getTo(): string | null {
  return process.env.NOTIFY_EMAIL ?? null
}

export async function sendMonthStartEmail(params: {
  parentTitle: string
  sequelTitle: string
  startDate: { year: number | null; month: number | null; day: number | null }
  status: string
}): Promise<boolean> {
  const transport = createTransport()
  const to = getTo()
  if (!transport || !to) {
    console.warn('[mailer] Missing email config — skipping')
    return false
  }

  const { startDate, status } = params
  const dateStr =
    status === 'RELEASING'
      ? 'כבר משודרת!'
      : startDate.day
        ? `${startDate.day}/${startDate.month}/${startDate.year}`
        : startDate.month
          ? `${startDate.month}/${startDate.year}`
          : 'תאריך לא ידוע'

  const statusLabel = status === 'RELEASING' ? 'כבר משודרת!' : 'יוצאת החודש'

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🎌 עונה חדשה החודש: ${params.parentTitle}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #e11d48;">🎌 עונה חדשה יוצאת החודש!</h2>
        <p>האנימה <strong>${params.parentTitle}</strong> קיבלה עונה חדשה:</p>
        <div style="background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>${params.sequelTitle}</strong><br/>
          <span style="color: #a6e3a1;">${statusLabel}</span><br/>
          <span style="color: #89b4fa; font-size: 14px;">📅 ${dateStr}</span>
        </div>
        <p style="color: #888; font-size: 12px;">נשלח אוטומטית ע"י Anime Tracker</p>
      </div>
    `,
  })

  console.log(`[mailer] Month-start email sent for ${params.sequelTitle}`)
  return true
}

export async function sendDayBeforeEmail(params: {
  parentTitle: string
  sequelTitle: string
  startDate: { year: number | null; month: number | null; day: number | null }
}): Promise<boolean> {
  const transport = createTransport()
  const to = getTo()
  if (!transport || !to) {
    console.warn('[mailer] Missing email config — skipping')
    return false
  }

  const { startDate } = params
  const dateStr = startDate.day
    ? `${startDate.day}/${startDate.month}/${startDate.year}`
    : 'מחר'

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `⏰ מחר יוצאת: ${params.parentTitle}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #f59e0b;">⏰ מחר יוצאת עונה חדשה!</h2>
        <p>האנימה <strong>${params.parentTitle}</strong> — מחר מתחילה עונה חדשה:</p>
        <div style="background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>${params.sequelTitle}</strong><br/>
          <span style="color: #fab387; font-size: 14px;">📅 ${dateStr}</span>
        </div>
        <p style="color: #888; font-size: 12px;">נשלח אוטומטית ע"י Anime Tracker</p>
      </div>
    `,
  })

  console.log(`[mailer] Day-before email sent for ${params.sequelTitle}`)
  return true
}

export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_EMAIL)
}
