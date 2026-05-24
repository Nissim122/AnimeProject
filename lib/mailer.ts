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
  const releasing = items.filter(i => i.status === 'RELEASING')
  const announced = items.filter(i => i.status === 'NOT_YET_RELEASED')
  const avail = available ?? []
  const total = releasing.length + announced.length + avail.length

  function formatAiringDate(ts: number): string {
    const d = new Date(ts * 1000)
    const date = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' })
    const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })
    return `${date}, ${time}`
  }

  function formatMonthYear(year: number | null, month: number | null): string {
    if (!month || !year) return 'TBA'
    return new Date(year, month - 1).toLocaleDateString('he-IL', { month: 'short', year: '2-digit' })
  }

  function buildSeasonDots(seasons: AnimeResult[], currentId: number): string {
    return seasons.slice(0, 10).map(s => {
      const isCurrent = s.id === currentId
      const isDone = s.status === 'FINISHED'
      const cls = isCurrent ? 'current' : isDone ? 'done' : ''
      const w = isCurrent ? '20px' : '10px'
      return `<div class="sdot ${cls}" style="width:${w};height:4px;border-radius:2px;display:inline-block;margin-left:5px;background:${isCurrent ? '#e0176b' : isDone ? 'rgba(224,23,107,0.35)' : 'rgba(255,255,255,0.1)'};${isCurrent ? 'box-shadow:0 0 6px #e0176b99;' : ''}"></div>`
    }).join('')
  }

  const releasingCards = releasing.map(item => {
    const idx = item.seasons.findIndex(s => s.id === item.sequelId)
    const seasonNum = idx >= 0 ? idx + 1 : 1
    const isNewSeason = (item.totalSeasons ?? 1) > 1
    const badgeNew = isNewSeason
      ? `<span style="background:linear-gradient(90deg,#e0176b,#8a0d42);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;letter-spacing:0.07em;text-transform:uppercase;">⬡ עונה ${seasonNum}</span>`
      : `<span style="background:#2a0a1a;color:#e0176b;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid rgba(224,23,107,0.35);letter-spacing:0.07em;text-transform:uppercase;">עונה 1</span>`
    const badgeTotal = (item.totalSeasons ?? 0) > 1
      ? `<span style="background:rgba(255,255,255,0.06);color:#888;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,0.1);">מתוך ${item.totalSeasons} עונות</span>`
      : ''
    const coverHtml = item.coverImage
      ? `<img src="${item.coverImage}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:100%;height:100%;background:linear-gradient(160deg,#2a0a1a,#1f2937);display:flex;align-items:center;justify-content:center;font-size:32px;">🎌</div>`
    const aired = item.nextAiringEpisode ? item.nextAiringEpisode.episode - 1 : (item.sequelEpisodeCount ?? 0)
    const total_ = item.sequelEpisodeCount
    const pct = total_ && total_ > 0 ? Math.round((aired / total_) * 100) : 40
    const fractionHtml = total_
      ? `<span style="font-family:'Courier New',monospace;font-size:11px;color:#888;">${aired} / ${total_}</span>`
      : `<span style="font-size:11px;color:#888;font-style:italic;">? ס"כ</span>`
    const nextRowHtml = item.nextAiringEpisode
      ? `<div style="display:flex;align-items:center;gap:7px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 5px #4ade80;flex-shrink:0;"></div>
          <div style="font-size:13px;color:#888;flex:1;">פרק <strong style="color:#4ade80;">${item.nextAiringEpisode.episode}</strong> → ${formatAiringDate(item.nextAiringEpisode.airingAt)}</div>
          <span style="font-family:'Courier New',monospace;font-size:11px;color:#555;">ep.${String(item.nextAiringEpisode.episode).padStart(2,'0')}</span>
        </div>`
      : ''
    return `
    <div style="margin:0 10px 10px;background:#1f2937;border-radius:16px;border:1px solid rgba(224,23,107,0.2);overflow:hidden;display:flex;min-height:140px;">
      <div style="flex:1;min-width:0;padding:14px 14px 12px;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px;">${badgeNew}${badgeTotal}</div>
          <div style="font-size:17px;font-weight:700;color:#d1ddf9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.hebrewTitle}</div>
          <div style="font-family:'Courier New',monospace;font-size:10px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:right;margin-top:1px;">${item.sequelTitle}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;margin-top:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-size:13px;color:#888;white-space:nowrap;"><strong style="color:#d1ddf9;">${aired}</strong> פרקים</div>
            <div style="flex:1;height:5px;background:rgba(255,255,255,0.09);border-radius:3px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;border-radius:3px;background:linear-gradient(to left,#e0176b,#8a0d42);"></div>
            </div>
            ${fractionHtml}
          </div>
          ${nextRowHtml}
          <div style="display:flex;align-items:center;gap:0;">${buildSeasonDots(item.seasons, item.sequelId)}</div>
        </div>
      </div>
      <div style="width:96px;flex-shrink:0;overflow:hidden;">${coverHtml}</div>
    </div>`
  }).join('')

  const announcedCards = announced.map(item => {
    const idx = item.seasons.findIndex(s => s.id === item.sequelId)
    const seasonNum = idx >= 0 ? idx + 1 : 1
    const prevSeasons = item.seasons.filter(s => s.status === 'FINISHED').length
    const dateVal = formatMonthYear(item.startDate.year, item.startDate.month)
    const dateColor = dateVal === 'TBA' ? '#555' : '#fbbf24'
    return `
    <div style="margin:0 10px 8px;background:#1f2937;border-radius:14px;border:1px solid rgba(251,191,36,0.22);padding:14px 14px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:16px;font-weight:700;color:#d1ddf9;">${item.hebrewTitle}</div>
          <div style="font-family:'Courier New',monospace;font-size:11px;color:#888;margin-top:3px;">${item.englishTitle}</div>
        </div>
        <span style="font-size:10px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.25);padding:3px 9px;border-radius:5px;white-space:nowrap;flex-shrink:0;margin-right:8px;">עונה ${seasonNum} הוכרזה</span>
      </div>
      <div style="display:flex;align-items:stretch;">
        <div style="text-align:center;flex:1;padding:6px 0;">
          <div style="font-size:20px;font-weight:900;color:#d1ddf9;line-height:1.1;">${prevSeasons}</div>
          <div style="font-size:10px;color:#888;margin-top:3px;">עונות קודמות</div>
        </div>
        <div style="width:1px;background:rgba(251,191,36,0.13);flex-shrink:0;margin:4px 0;"></div>
        <div style="text-align:center;flex:1;padding:6px 0;">
          <div style="font-size:20px;font-weight:900;color:#d1ddf9;line-height:1.1;">${item.sequelEpisodeCount ?? '—'}</div>
          <div style="font-size:10px;color:#888;margin-top:3px;">פרקים ס"כ</div>
        </div>
        <div style="width:1px;background:rgba(251,191,36,0.13);flex-shrink:0;margin:4px 0;"></div>
        <div style="text-align:center;flex:1;padding:6px 0;">
          <div style="font-size:${dateVal === 'TBA' ? '15px' : '20px'};font-weight:900;color:${dateColor};line-height:1.1;">${dateVal}</div>
          <div style="font-size:10px;color:#888;margin-top:3px;">${dateVal === 'TBA' ? 'תאריך לא ידוע' : 'תחילת שידור'}</div>
        </div>
      </div>
    </div>`
  }).join('')

  const availableCards = avail.map(a => {
    const seasonCtx = (a.currentSeasonNumber && a.totalSeasons)
      ? `עונה ${a.currentSeasonNumber} מתוך ${a.totalSeasons} · כל הפרקים זמינים`
      : 'כל הפרקים זמינים'
    return `
    <div style="margin:0 10px 8px;background:#1f2937;border-radius:14px;border:1px solid rgba(74,222,128,0.2);padding:14px 14px;display:flex;align-items:center;gap:12px;">
      <div style="width:42px;height:42px;border-radius:11px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.22);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;color:#4ade80;order:2;">▶</div>
      <div style="flex:1;order:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:#d1ddf9;">${a.sequelTitle}</div>
        <div style="font-size:12px;color:#888;margin-top:3px;">המשך של ${a.parentTitle} · ${seasonCtx}</div>
      </div>
      <a href="#" style="font-size:12px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:0.07em;order:3;white-space:nowrap;padding:8px 14px;border:1px solid rgba(74,222,128,0.28);border-radius:9px;text-decoration:none;background:rgba(74,222,128,0.08);display:inline-block;">צפה עכשיו ↗</a>
    </div>`
  }).join('')

  const subtitleParts: string[] = []
  if (releasing.length > 0) subtitleParts.push(`${releasing.length} בשידור`)
  if (announced.length > 0) subtitleParts.push(`${announced.length} הוכרזו`)
  if (avail.length > 0) subtitleParts.push(`${avail.length} ממתין`)

  const releasingSection = releasing.length > 0 ? `
    <div style="display:flex;align-items:center;gap:8px;padding:22px 16px 10px;">
      <div style="width:8px;height:8px;border-radius:50%;background:#e0176b;box-shadow:0 0 7px rgba(224,23,107,0.67);flex-shrink:0;"></div>
      <div style="font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#d1ddf9;">בשידור כעת</div>
      <div style="font-family:'Courier New',monospace;font-size:11px;color:#888;margin-right:auto;">${releasing.length} סדרות</div>
    </div>
    ${releasingCards}` : ''

  const announcedSection = announced.length > 0 ? `
    <div style="height:1px;background:rgba(255,255,255,0.05);margin:6px 10px 2px;"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:22px 16px 10px;">
      <div style="width:8px;height:8px;border-radius:50%;background:#fbbf24;box-shadow:0 0 7px rgba(251,191,36,0.67);flex-shrink:0;"></div>
      <div style="font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#d1ddf9;">הוכרזה עונה</div>
      <div style="font-family:'Courier New',monospace;font-size:11px;color:#888;margin-right:auto;">${announced.length} סדרות</div>
    </div>
    ${announcedCards}` : ''

  const availableSection = avail.length > 0 ? `
    <div style="height:1px;background:rgba(255,255,255,0.05);margin:6px 10px 2px;"></div>
    <div style="display:flex;align-items:center;gap:8px;padding:22px 16px 10px;">
      <div style="width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 7px rgba(74,222,128,0.67);flex-shrink:0;"></div>
      <div style="font-size:11px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#d1ddf9;">ממתין לצפייה</div>
      <div style="font-family:'Courier New',monospace;font-size:11px;color:#888;margin-right:auto;">${avail.length} ${avail.length === 1 ? 'עונה זמינה' : 'עונות זמינות'}</div>
    </div>
    ${availableCards}` : ''

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🎌 עדכון חודשי — ${subtitleParts.join(' · ')}`,
    html: `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#070710;font-family:'Heebo',Arial,sans-serif;direction:rtl;-webkit-text-size-adjust:100%;">
<div style="max-width:480px;margin:0 auto;background:#070710;padding-bottom:24px;">

  <div style="padding:28px 16px 14px;border-bottom:1px solid rgba(224,23,107,0.18);display:flex;justify-content:space-between;align-items:center;">
    <div style="font-family:'Space Mono','Courier New',monospace;font-size:10px;color:#888;letter-spacing:0.14em;text-transform:uppercase;">anime tracker</div>
    <div style="font-size:12px;color:#888;font-weight:300;">${new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</div>
  </div>

  <div style="padding:20px 16px 10px;">
    <div style="font-size:26px;font-weight:900;color:#d1ddf9;line-height:1.15;">עדכון <span style="background:linear-gradient(90deg,#e0176b,#8a0d42);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">חודשי</span></div>
    <div style="font-size:13px;color:#888;margin-top:5px;font-weight:300;">${subtitleParts.join(' · ')}</div>
  </div>

  ${releasingSection}
  ${announcedSection}
  ${availableSection}

  <div style="padding:22px 16px 8px;border-top:1px solid rgba(224,23,107,0.1);margin-top:16px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:11px;color:#555;">עודכן ע"י AniList API</div>
    <div style="font-family:'Space Mono','Courier New',monospace;font-size:10px;color:#555;letter-spacing:0.12em;">ANIME TRACKER</div>
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
