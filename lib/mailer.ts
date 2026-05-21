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

export async function sendNewSeasonEmail(params: {
  parentTitle: string
  sequelTitle: string
  sequelYear: number | null
  status: string
}): Promise<boolean> {
  const transport = createTransport()
  const to = process.env.NOTIFY_EMAIL

  if (!transport || !to) {
    console.warn('[mailer] Missing EMAIL_USER, EMAIL_PASS or NOTIFY_EMAIL — skipping email')
    return false
  }

  const yearStr = params.sequelYear ? ` (${params.sequelYear})` : ''
  const statusLabel =
    params.status === 'RELEASING' ? 'כבר משודרת!' : 'תצא בקרוב'

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🎌 עונה חדשה: ${params.parentTitle}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #e11d48;">🎌 עונה חדשה יצאה!</h2>
        <p>האנימה <strong>${params.parentTitle}</strong> קיבלה עונה חדשה:</p>
        <div style="background: #1e1e2e; color: #cdd6f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <strong>${params.sequelTitle}${yearStr}</strong><br/>
          <span style="color: #a6e3a1;">${statusLabel}</span>
        </div>
        <p style="color: #888; font-size: 12px;">נשלח אוטומטית ע"י Anime Tracker</p>
      </div>
    `,
  })

  console.log(`[mailer] Email sent for ${params.sequelTitle}`)
  return true
}

export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_EMAIL)
}
