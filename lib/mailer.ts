import nodemailer from 'nodemailer'
import type { AnimeResult } from './anilist'

function unixTimestampToDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

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
      const rowBg = isNew ? '#2a0a1a' : i % 2 === 0 ? '#16161f' : '#1a1a2a'
      const titleColor = isNew ? '#d1ddf9' : '#cdd6f4'
      const episodesStr = s.episodes ? `${s.episodes} פרקים` : '—'
      const yearStr = s.seasonYear ?? '—'
      const newBadge = isNew
        ? `<span style="background:#e0176b;color:white;font-size:10px;padding:2px 8px;border-radius:8px;margin-left:6px;">חדש</span>`
        : ''
      const newBorder = isNew ? 'border-right:3px solid #e0176b;' : ''
      return `
        <tr style="background:${rowBg};">
          <td style="padding:11px 14px;color:${titleColor};border-bottom:1px solid #222;${newBorder}">
            ${newBadge}${s.title.english ?? s.title.romaji}
          </td>
          <td style="padding:11px 14px;text-align:center;color:#d1ddf9;border-bottom:1px solid #222;width:55px;">${yearStr}</td>
          <td style="padding:11px 14px;text-align:center;color:#a6e3a1;border-bottom:1px solid #222;width:75px;">${episodesStr}</td>
        </tr>`
    })
    .join('')
}

function buildAvailableSection(available: Array<{ parentTitle: string; sequelTitle: string; currentSeasonNumber?: number; totalSeasons?: number }>): string {
  if (available.length === 0) return ''

  const cards = available
    .map(
      (a) => {
        const seasonContext = (a.currentSeasonNumber && a.totalSeasons)
          ? `<div style="color:#888;font-size:11px;margin-top:4px;">עונה ${a.currentSeasonNumber} מתוך ${a.totalSeasons}</div>`
          : ''
        return `
        <div style="background:#16161f;border-right:3px solid #e0176b;border-radius:4px;padding:12px 14px;margin-bottom:6px;">
          <div style="color:#d1ddf9;font-size:15px;font-weight:bold;margin-bottom:3px;">📺 ${a.sequelTitle}</div>
          <div style="color:#888;font-size:12px;">המשך של ${a.parentTitle}</div>
          ${seasonContext}
        </div>`
      }
    )
    .join('')

  return `
  <!-- Available/unwatched section -->
  <div style="padding:0 24px 24px;">
    <div style="font-size:12px;color:#e0176b;margin-bottom:10px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">
      📺 ממתין לצפייה · ${available.length} עונות
    </div>
    ${cards}
  </div>`
}

export interface UpdatesEmailItem {
  title: string
  coverImage?: string
  subtitle?: string
}

export async function sendUpdatesEmail(params: {
  watching: UpdatesEmailItem[]
  releasing: UpdatesEmailItem[]
  upcoming: UpdatesEmailItem[]
}): Promise<boolean> {
  const transport = createTransport()
  const to = getTo()
  if (!transport || !to) {
    console.warn('[mailer] Missing email config — skipping')
    return false
  }

  const { watching, releasing, upcoming } = params
  const total = watching.length + releasing.length + upcoming.length

  function buildGroup(
    items: UpdatesEmailItem[],
    icon: string,
    label: string,
    headerColor: string,
    subtitleColor: string,
  ): string {
    if (items.length === 0) return ''
    const rows = items
      .map(
        (item, i) => `
        <tr style="background:${i % 2 === 0 ? '#16161f' : '#1a1a2a'};">
          <td style="padding:11px 12px;border-bottom:1px solid #222;vertical-align:top;width:44px;">
            ${item.coverImage ? `<img src="${item.coverImage}" alt="" style="width:36px;height:50px;object-fit:cover;border-radius:4px;display:block;" />` : ''}
          </td>
          <td style="padding:11px 12px;border-bottom:1px solid #222;vertical-align:middle;">
            <div style="color:#e2e8f0;font-size:14px;font-weight:bold;">${item.title}</div>
            ${item.subtitle ? `<div style="color:${subtitleColor};font-size:12px;margin-top:3px;">${item.subtitle}</div>` : ''}
          </td>
        </tr>`,
      )
      .join('')
    return `
    <div style="padding:0 24px 20px;">
      <div style="font-size:11px;color:${headerColor};font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
        ${icon} ${label} · ${items.length}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-radius:8px;overflow:hidden;">
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }

  const watchingSection = buildGroup(watching, '📺', 'צופה', '#e0176b', '#d1ddf9')
  const releasingSection = buildGroup(releasing, '🟢', 'יוצאים פרקים חדשים', '#4ade80', '#4ade80')
  const upcomingSection = buildGroup(upcoming, '📅', 'הוכרזה עונה', '#fbbf24', '#fbbf24')

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🎌 עדכוני אנימה — ${total} סדרות`,
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#070710;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#0f0f1a;border-radius:14px;overflow:hidden;border:1px solid #1e1e2e;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#e0176b 0%,#8a0d42 100%);padding:32px 24px;text-align:center;">
    <div style="font-size:40px;margin-bottom:8px;">🎌</div>
    <h1 style="color:white;margin:0;font-size:22px;font-weight:bold;letter-spacing:1px;">עדכוני אנימה</h1>
    <p style="color:#d1ddf9;margin:8px 0 0;font-size:14px;">${total} סדרות עם עדכון</p>
  </div>

  <div style="padding:20px 0 4px;">
    ${watchingSection}
    ${releasingSection}
    ${upcomingSection}
  </div>

  <!-- Footer -->
  <div style="padding:14px 24px;border-top:1px solid #1a1a2a;text-align:center;">
    <p style="color:#555;font-size:11px;margin:0;">נשלח אוטומטית ע"י Anime Tracker</p>
  </div>

</div>
</body>
</html>`,
  })

  console.log(`[mailer] Updates summary email sent (${total} items)`)
  return true
}

export async function sendConsolidatedMonthlyEmail(params: {
  items: Array<{
    hebrewTitle: string
    englishTitle: string
    sequelTitle: string
    coverImage?: string
    status: string
    nextAiringEpisode?: { episode: number; airingAt: number } | null
    sequelEpisodeCount?: number | null
    totalSeasons?: number
    sequelId: number
    startDate: { year: number | null; month: number | null; day: number | null }
    seasons: AnimeResult[]
  }>
  available?: Array<{ parentTitle: string; sequelTitle: string; currentSeasonNumber?: number; totalSeasons?: number }>
  toEmail?: string
}): Promise<boolean> {
  const transport = createTransport()
  const to = params.toEmail ?? getTo()
  if (!transport || !to) {
    console.warn('[mailer] Missing email config — skipping')
    return false
  }

  const { items, available } = params
  const total = items.length + (available?.length ?? 0)

  const itemCards = items.map((item) => {
    const isReleasing = item.status === 'RELEASING'
    const statusLabel = isReleasing ? 'משודרת עכשיו' : 'יוצאת החודש'
    const statusBg = isReleasing ? '#166534' : '#3d0a1e'
    const statusColor = isReleasing ? '#a6e3a1' : '#d1ddf9'

    const dateStr = item.startDate.day
      ? `${item.startDate.day}/${item.startDate.month}/${item.startDate.year}`
      : item.startDate.month
        ? `${item.startDate.month}/${item.startDate.year}`
        : ''

    const coverHtml = item.coverImage
      ? `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
          <tr>
            <td style="width:84px;vertical-align:top;">
              <img src="${item.coverImage}" alt="cover" style="width:78px;height:110px;object-fit:cover;border-radius:6px;display:block;" />
            </td>
            <td style="vertical-align:top;padding-right:12px;">
              <span style="background:${statusBg};color:${statusColor};font-size:11px;padding:2px 10px;border-radius:10px;font-weight:bold;">${statusLabel}</span>
              <div style="font-size:16px;font-weight:bold;color:#fff;margin-top:6px;">${item.hebrewTitle}</div>
              <div style="font-size:12px;color:#666;margin-bottom:4px;">${item.englishTitle}</div>
              <div style="font-size:14px;color:#d1ddf9;margin-bottom:4px;">${item.sequelTitle}</div>
              ${dateStr ? `<div style="color:#888;font-size:13px;">📅 ${dateStr}</div>` : ''}
            </td>
          </tr>
        </table>`
      : `<div style="margin-bottom:12px;">
          <span style="background:${statusBg};color:${statusColor};font-size:11px;padding:2px 10px;border-radius:10px;font-weight:bold;">${statusLabel}</span>
          <div style="font-size:16px;font-weight:bold;color:#fff;margin-top:6px;">${item.hebrewTitle}</div>
          <div style="font-size:12px;color:#666;">${item.englishTitle}</div>
          <div style="font-size:14px;color:#d1ddf9;">${item.sequelTitle}</div>
          ${dateStr ? `<div style="color:#888;font-size:13px;">📅 ${dateStr}</div>` : ''}
        </div>`

    let detailHtml = ''
    if (isReleasing && item.nextAiringEpisode) {
      const episodesAired = item.nextAiringEpisode.episode - 1
      const nextEpDate = unixTimestampToDate(item.nextAiringEpisode.airingAt)
      detailHtml = `
        <div style="background:#0d2a1a;border-right:3px solid #4ade80;border-radius:4px;padding:10px 12px;margin-bottom:10px;">
          <div style="color:#4ade80;font-size:11px;font-weight:bold;margin-bottom:4px;">📡 מצב שידור</div>
          <div style="color:#d1ddf9;font-size:12px;">פרקים שיצאו: <strong>${episodesAired}</strong> · פרק הבא: <strong>${item.nextAiringEpisode.episode}</strong> בתאריך <strong>${nextEpDate}</strong></div>
        </div>`
    } else if (!isReleasing) {
      const parts: string[] = []
      if (item.sequelEpisodeCount) parts.push(`פרקים מוכרזים: <strong>${item.sequelEpisodeCount}</strong>`)
      if (item.nextAiringEpisode?.airingAt) parts.push(`פרק ראשון: <strong>${unixTimestampToDate(item.nextAiringEpisode.airingAt)}</strong>`)
      if (item.totalSeasons) parts.push(`עונות בסדרה: <strong>${item.totalSeasons}</strong>`)
      if (parts.length > 0) {
        detailHtml = `
          <div style="background:#1a1a0d;border-right:3px solid #fbbf24;border-radius:4px;padding:10px 12px;margin-bottom:10px;">
            <div style="color:#fbbf24;font-size:11px;font-weight:bold;margin-bottom:4px;">📅 פרטי הכרזה</div>
            <div style="color:#d1ddf9;font-size:12px;">${parts.join(' · ')}</div>
          </div>`
      }
    }

    const seasonsTableHtml = item.seasons.length > 1 ? `
      <div style="margin-top:4px;">
        <div style="font-size:11px;color:#e0176b;margin-bottom:6px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">כל עונות הסדרה · ${item.seasons.length}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#1e1e2e;">
            <th style="padding:8px 12px;text-align:right;color:#888;font-weight:normal;">שם</th>
            <th style="padding:8px 12px;text-align:center;color:#888;font-weight:normal;width:50px;">שנה</th>
            <th style="padding:8px 12px;text-align:center;color:#888;font-weight:normal;width:70px;">פרקים</th>
          </tr></thead>
          <tbody>${buildSeasonRows(item.seasons, item.sequelId)}</tbody>
        </table>
      </div>` : ''

    return `
      <div style="background:#1a0a1e;border:1px solid #e0176b;border-radius:10px;padding:16px;margin-bottom:20px;">
        ${coverHtml}${detailHtml}${seasonsTableHtml}
      </div>`
  }).join('')

  const availableSection = available && available.length > 0 ? buildAvailableSection(available) : ''

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🎌 עדכון אנימה — ${total} ${total === 1 ? 'סדרה' : 'סדרות'}`,
    html: `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#070710;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#0f0f1a;border-radius:14px;overflow:hidden;border:1px solid #1e1e2e;">

  <div style="background:linear-gradient(135deg,#e0176b 0%,#8a0d42 100%);padding:32px 24px;text-align:center;">
    <div style="font-size:40px;margin-bottom:8px;">🎌</div>
    <h1 style="color:white;margin:0;font-size:22px;font-weight:bold;letter-spacing:1px;">עדכון אנימה חודשי</h1>
    ${items.length > 0 ? `<p style="color:#d1ddf9;margin:8px 0 0;font-size:14px;">${items.length} ${items.length === 1 ? 'סדרה עם עדכון' : 'סדרות עם עדכון'}</p>` : ''}
  </div>

  <div style="padding:20px 24px 4px;">
    ${itemCards}
  </div>

  ${availableSection}

  <div style="padding:14px 24px;border-top:1px solid #1a1a2a;text-align:center;">
    <p style="color:#555;font-size:11px;margin:0;">נשלח אוטומטית ע"י Anime Tracker</p>
  </div>

</div>
</body>
</html>`,
  })

  console.log(`[mailer] Consolidated monthly email sent (${total} items)`)
  return true
}

export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_EMAIL)
}
