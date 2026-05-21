import nodemailer from 'nodemailer'
import type { AnimeResult } from './anilist'

function createTransport() {
  const user = process.env.EMAIL_USER
  const pass = process.env.EMAIL_PASS
  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

function getTo(): string | null {
  return process.env.NOTIFY_EMAIL ?? null
}

function buildSeasonRows(seasons: AnimeResult[], highlightId: number): string {
  return seasons
    .map((s, i) => {
      const isNew = s.id === highlightId
      const rowBg = isNew ? '#2a1a2e' : i % 2 === 0 ? '#16161f' : '#1a1a2a'
      const titleColor = isNew ? '#f9a8d4' : '#cdd6f4'
      const episodesStr = s.episodes ? `${s.episodes} פרקים` : '—'
      const yearStr = s.seasonYear ?? '—'
      const newBadge = isNew
        ? `<span style="background:#e11d48;color:white;font-size:10px;padding:1px 6px;border-radius:8px;margin-right:6px;">חדש</span>`
        : ''
      return `
        <tr style="background:${rowBg};">
          <td style="padding:9px 12px;color:${titleColor};border-bottom:1px solid #222;">
            ${newBadge}${s.title.english ?? s.title.romaji}
          </td>
          <td style="padding:9px 12px;text-align:center;color:#89b4fa;border-bottom:1px solid #222;">${yearStr}</td>
          <td style="padding:9px 12px;text-align:center;color:#a6e3a1;border-bottom:1px solid #222;">${episodesStr}</td>
        </tr>`
    })
    .join('')
}

export async function sendMonthStartEmail(params: {
  hebrewTitle: string
  englishTitle: string
  sequelId: number
  sequelTitle: string
  startDate: { year: number | null; month: number | null; day: number | null }
  status: string
  seasons: AnimeResult[]
}): Promise<boolean> {
  const transport = createTransport()
  const to = getTo()
  if (!transport || !to) {
    console.warn('[mailer] Missing email config — skipping')
    return false
  }

  const { hebrewTitle, englishTitle, sequelTitle, startDate, status, seasons, sequelId } = params

  const statusLabel = status === 'RELEASING' ? 'משודרת עכשיו' : 'יוצאת החודש'
  const statusColor = status === 'RELEASING' ? '#a6e3a1' : '#fab387'

  const dateStr = startDate.day
    ? `${startDate.day}/${startDate.month}/${startDate.year}`
    : startDate.month
      ? `${startDate.month}/${startDate.year}`
      : ''

  const seasonRows = buildSeasonRows(seasons, sequelId)
  const totalSeasons = seasons.length

  const sequelCover = seasons.find((s) => s.id === sequelId)?.coverImage?.large ?? ''
  const coverHtml = sequelCover
    ? `<img src="${sequelCover}" alt="cover" style="width:100px;border-radius:8px;float:left;margin:0 0 8px 16px;" />`
    : ''

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🎌 עונה חדשה החודש: ${hebrewTitle}`,
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<body style="margin:0;padding:0;background:#070710;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#0f0f1a;border-radius:14px;overflow:hidden;border:1px solid #1e1e2e;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#9333ea 0%,#e11d48 100%);padding:28px 24px;text-align:center;">
    <div style="font-size:36px;margin-bottom:6px;">🎌</div>
    <h1 style="color:white;margin:0;font-size:20px;font-weight:bold;letter-spacing:1px;">עונה חדשה החודש!</h1>
  </div>

  <!-- Title block -->
  <div style="padding:24px 24px 0;text-align:center;">
    <div style="font-size:26px;font-weight:bold;color:#fff;margin-bottom:4px;">${hebrewTitle}</div>
    <div style="font-size:13px;color:#666;">${englishTitle}</div>
  </div>

  <!-- New season card -->
  <div style="padding:20px 24px;">
    <div style="background:#1a0a1e;border:1px solid #e11d48;border-radius:10px;padding:16px;overflow:hidden;">
      ${coverHtml}
      <div style="overflow:hidden;">
        <div style="margin-bottom:8px;">
          <span style="background:${statusColor === '#a6e3a1' ? '#166534' : '#7c2d12'};color:${statusColor};font-size:11px;padding:3px 10px;border-radius:12px;font-weight:bold;">${statusLabel}</span>
        </div>
        <div style="font-size:16px;font-weight:bold;color:#f9a8d4;margin-bottom:6px;">${sequelTitle}</div>
        ${dateStr ? `<div style="color:#89b4fa;font-size:13px;">📅 תאריך: ${dateStr}</div>` : ''}
      </div>
      <div style="clear:both;"></div>
    </div>
  </div>

  <!-- Seasons table -->
  <div style="padding:0 24px 24px;">
    <div style="font-size:12px;color:#555;margin-bottom:8px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
      כל עונות הסדרה · ${totalSeasons} עונות
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#1e1e2e;">
          <th style="padding:8px 12px;text-align:right;color:#888;font-weight:normal;">שם</th>
          <th style="padding:8px 12px;text-align:center;color:#888;font-weight:normal;width:60px;">שנה</th>
          <th style="padding:8px 12px;text-align:center;color:#888;font-weight:normal;width:80px;">פרקים</th>
        </tr>
      </thead>
      <tbody>
        ${seasonRows}
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:14px 24px;border-top:1px solid #1a1a2a;text-align:center;">
    <p style="color:#333;font-size:11px;margin:0;">נשלח אוטומטית ע"י Anime Tracker</p>
  </div>

</div>
</body>
</html>`,
  })

  console.log(`[mailer] Month-start email sent for ${sequelTitle}`)
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
      </div>`,
  })

  console.log(`[mailer] Day-before email sent for ${params.sequelTitle}`)
  return true
}

export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_EMAIL)
}
