import nodemailer from 'nodemailer'
import type { AnimeResult } from './anilist'


function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
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
      ? `<span style="display:inline-block;background:linear-gradient(90deg,#e0176b,#8a0d42);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;letter-spacing:0.07em;text-transform:uppercase;">⬡ עונה ${seasonNum}</span>`
      : `<span style="display:inline-block;background:#2a0a1a;color:#e0176b;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid rgba(224,23,107,0.35);letter-spacing:0.07em;text-transform:uppercase;">עונה 1</span>`
    const badgeTotal = (item.totalSeasons ?? 0) > 1
      ? `<span style="display:inline-block;background:rgba(255,255,255,0.06);color:#888;font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid rgba(255,255,255,0.1);">מתוך ${item.totalSeasons} עונות</span>`
      : ''
    const badgeGap = badgeTotal ? `<span style="display:inline-block;width:5px;"></span>` : ''
    const coverHtml = item.coverImage
      ? `<img src="${item.coverImage}" alt="" style="width:96px;height:100%;min-height:140px;object-fit:cover;display:block;" />`
      : `<div style="width:96px;min-height:140px;background:linear-gradient(160deg,#2a0a1a,#1f2937);display:flex;align-items:center;justify-content:center;font-size:32px;">🎌</div>`
    const aired = item.nextAiringEpisode ? item.nextAiringEpisode.episode - 1 : (item.sequelEpisodeCount ?? 0)
    const total_ = item.sequelEpisodeCount
    const pct = total_ && total_ > 0 ? Math.round((aired / total_) * 100) : 40
    const emptyPct = 100 - pct
    const fractionHtml = total_
      ? `<span style="font-family:'Courier New',monospace;font-size:11px;color:#888;flex-shrink:0;">${aired} / ${total_}</span>`
      : `<span style="font-size:11px;color:#555;flex-shrink:0;">? ס"כ</span>`
    const nextRowHtml = item.nextAiringEpisode
      ? `<div style="display:flex;align-items:center;gap:7px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 5px #4ade80;flex-shrink:0;"></div>
          <div style="font-size:13px;color:#888;flex:1;min-width:0;">פרק <strong style="color:#4ade80;">${item.nextAiringEpisode.episode}</strong> · ${formatAiringDate(item.nextAiringEpisode.airingAt)}</div>
          <span style="font-family:'Courier New',monospace;font-size:11px;color:#555;flex-shrink:0;">ep.${String(item.nextAiringEpisode.episode).padStart(2,'0')}</span>
        </div>`
      : ''
    return `
    <div style="margin:0 10px 10px;background:#1f2937;border-radius:16px;border:1px solid rgba(224,23,107,0.2);overflow:hidden;display:flex;min-height:140px;">
      <div style="flex:1;min-width:0;padding:14px 14px 12px;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="margin-bottom:7px;line-height:2;">${badgeNew}${badgeGap}${badgeTotal}</div>
          <div style="font-size:17px;font-weight:700;color:#d1ddf9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.hebrewTitle}</div>
          <div style="font-family:'Courier New',monospace;font-size:10px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;text-align:right;margin-top:1px;">${item.sequelTitle}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px;margin-top:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="font-size:13px;color:#888;white-space:nowrap;flex-shrink:0;"><strong style="color:#d1ddf9;">${aired}</strong> פרקים</div>
            <div style="flex:1;height:5px;background:rgba(255,255,255,0.09);border-radius:3px;overflow:hidden;">
              <div style="margin-left:${emptyPct}%;width:${pct}%;height:100%;border-radius:3px;background:linear-gradient(to left,#e0176b,#8a0d42);"></div>
            </div>
            ${fractionHtml}
          </div>
          ${nextRowHtml}
          <div style="display:flex;align-items:center;gap:0;">${buildSeasonDots(item.seasons, item.sequelId)}</div>
        </div>
      </div>
      <div style="width:96px;flex-shrink:0;overflow:hidden;min-height:140px;">${coverHtml}</div>
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
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:16px;font-weight:700;color:#d1ddf9;">${item.hebrewTitle}</div>
          <div style="font-family:'Courier New',monospace;font-size:11px;color:#888;margin-top:3px;">${item.englishTitle}</div>
        </div>
        <span style="display:inline-block;font-size:10px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.25);padding:3px 9px;border-radius:5px;white-space:nowrap;flex-shrink:0;margin-left:8px;">עונה ${seasonNum} הוכרזה</span>
      </div>
      <div style="display:flex;align-items:stretch;">
        <div style="text-align:center;flex:1;padding:6px 0;">
          <div style="font-size:20px;font-weight:900;color:#d1ddf9;line-height:1.1;">${prevSeasons}</div>
          <div style="font-size:10px;color:#888;margin-top:3px;">עונות קודמות</div>
        </div>
        <div style="width:1px;background:rgba(251,191,36,0.13);flex-shrink:0;align-self:stretch;"></div>
        <div style="text-align:center;flex:1;padding:6px 0;">
          <div style="font-size:20px;font-weight:900;color:#d1ddf9;line-height:1.1;">${item.sequelEpisodeCount ?? '—'}</div>
          <div style="font-size:10px;color:#888;margin-top:3px;">פרקים ס"כ</div>
        </div>
        <div style="width:1px;background:rgba(251,191,36,0.13);flex-shrink:0;align-self:stretch;"></div>
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
    <div style="margin:0 10px 8px;background:#1f2937;border-radius:14px;border:1px solid rgba(74,222,128,0.2);padding:14px 14px;display:flex;align-items:center;gap:10px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:#d1ddf9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.sequelTitle}</div>
        <div style="font-size:12px;color:#888;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">המשך של ${a.parentTitle} · ${seasonCtx}</div>
      </div>
      <div style="width:36px;height:36px;border-radius:10px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.22);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;color:#4ade80;">▶</div>
      <a href="#" style="font-size:11px;font-weight:700;color:#4ade80;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;padding:7px 12px;border:1px solid rgba(74,222,128,0.28);border-radius:9px;text-decoration:none;background:rgba(74,222,128,0.08);display:inline-block;flex-shrink:0;">צפה ↗</a>
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

export async function sendApprovalRequestEmail(params: {
  toAdmin: string
  userEmail: string
  userName: string
  adminUrl: string
  approveUrl?: string
  denyUrl?: string
}): Promise<boolean> {
  const transport = createTransport()
  if (!transport) {
    console.warn('[mailer] Missing email config — skipping approval request email')
    return false
  }

  const { toAdmin, userEmail, userName, adminUrl, approveUrl, denyUrl } = params

  const actionButtons = approveUrl && denyUrl
    ? `<div style="display:flex;gap:12px;margin-top:8px;">
        <a href="${approveUrl}" style="flex:1;display:block;text-align:center;padding:14px;background:linear-gradient(90deg,#16a34a,#15803d);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;">✓ אשר גישה</a>
        <a href="${denyUrl}" style="flex:1;display:block;text-align:center;padding:14px;background:linear-gradient(90deg,#dc2626,#991b1b);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;">✕ דחה בקשה</a>
      </div>
      <p style="text-align:center;margin:16px 0 0;"><a href="${adminUrl}" style="color:#888;font-size:13px;text-decoration:underline;">פתח פאנל ניהול</a></p>`
    : `<a href="${adminUrl}" style="display:block;text-align:center;padding:14px;background:linear-gradient(90deg,#e0176b,#8a0d42);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;">סקור את הבקשה ←</a>`

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to: toAdmin,
    subject: `🔔 בקשת גישה חדשה — ${userName || userEmail}`,
    html: `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#070710;font-family:system-ui,Arial,sans-serif;direction:rtl;">
<div style="max-width:480px;margin:0 auto;padding:32px 16px;">
  <h1 style="color:#d1ddf9;font-size:22px;margin:0 0 8px;">בקשת גישה חדשה</h1>
  <p style="color:#888;font-size:14px;margin:0 0 24px;">משתמש חדש מבקש גישה ל-Anime Tracker.</p>

  <div style="background:#13131f;border:1px solid rgba(224,23,107,0.2);border-radius:16px;padding:20px 18px;margin-bottom:24px;">
    <div style="margin-bottom:10px;">
      <span style="font-size:12px;color:#888;">שם:</span>
      <span style="font-size:15px;color:#d1ddf9;font-weight:700;margin-right:8px;">${userName || '—'}</span>
    </div>
    <div>
      <span style="font-size:12px;color:#888;">מייל:</span>
      <span style="font-size:15px;color:#e0176b;font-weight:700;margin-right:8px;">${userEmail}</span>
    </div>
  </div>

  ${actionButtons}
</div>
</body>
</html>`,
  })

  console.log(`[mailer] Approval request email sent for ${userEmail}`)
  return true
}

export async function sendUserApprovedEmail(params: {
  userEmail: string
  userName: string
}): Promise<boolean> {
  const transport = createTransport()
  if (!transport) {
    console.warn('[mailer] Missing email config — skipping user approved email')
    return false
  }

  const { userEmail, userName } = params
  const appUrl = getBaseUrl()

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to: userEmail,
    subject: `✅ הגישה שלך אושרה — Anime Tracker`,
    html: `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#070710;font-family:system-ui,Arial,sans-serif;direction:rtl;">
<div style="max-width:480px;margin:0 auto;padding:32px 16px;text-align:center;">
  <h1 style="color:#d1ddf9;font-size:24px;margin:0 0 8px;">
    <span style="color:#e0176b;">Anime</span> Tracker
  </h1>

  <div style="background:#13131f;border:1px solid rgba(74,222,128,0.25);border-radius:20px;padding:32px 24px;margin:24px 0;">
    <div style="font-size:48px;margin-bottom:16px;">✅</div>
    <h2 style="color:#4ade80;font-size:20px;margin:0 0 12px;">הגישה אושרה!</h2>
    <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 24px;">
      ${userName ? `שלום ${userName}, ` : ''}הבקשה שלך אושרה ועכשיו יש לך גישה מלאה ל-Anime Tracker.
    </p>
    <a href="${appUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(90deg,#e0176b,#8a0d42);color:#fff;font-weight:700;font-size:15px;border-radius:12px;text-decoration:none;">כניסה לאפליקציה ↗</a>
  </div>
</div>
</body>
</html>`,
  })

  console.log(`[mailer] User approved email sent to ${userEmail}`)
  return true
}

export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_EMAIL)
}
