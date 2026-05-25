import nodemailer from 'nodemailer'
import type { AnimeResult } from './anilist'


function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV === 'production') return 'https://anime-project-beige.vercel.app'
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
  available?: Array<{ parentTitle: string; sequelTitle: string; currentSeasonNumber?: number; totalSeasons?: number; anilistId?: number }>
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
    if (seasons.length <= 1) return ''
    return seasons.slice(0, 12).map(s => {
      const isCurrent = s.id === currentId
      const isDone = s.status === 'FINISHED'
      const w = isCurrent ? '18px' : '8px'
      return `<div style="width:${w};height:4px;border-radius:2px;flex-shrink:0;background:${isCurrent ? '#e0176b' : isDone ? 'rgba(224,23,107,0.4)' : 'rgba(255,255,255,0.08)'};${isCurrent ? 'box-shadow:0 0 5px rgba(224,23,107,0.5);' : ''}"></div>`
    }).join('')
  }

  const releasingCards = releasing.map(item => {
    const idx = item.seasons.findIndex(s => s.id === item.sequelId)
    const seasonNum = idx >= 0 ? idx + 1 : null

    const badge = seasonNum
      ? `<span style="display:inline-block;background:rgba(224,23,107,0.1);border:1px solid rgba(224,23,107,0.28);color:#e0176b;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:9px;">▶ AIRING · עונה ${seasonNum}</span>`
      : `<span style="display:inline-block;background:rgba(224,23,107,0.1);border:1px solid rgba(224,23,107,0.28);color:#e0176b;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:9px;">▶ בשידור</span>`

    const coverHtml = item.coverImage
      ? `<img src="${item.coverImage}" alt="" style="width:100%;height:100%;min-height:140px;object-fit:cover;display:block;" />`
      : `<div style="width:100%;min-height:140px;background:#0d1117;display:flex;align-items:center;justify-content:center;font-size:28px;">🎌</div>`

    const aired = item.nextAiringEpisode
      ? item.nextAiringEpisode.episode - 1
      : item.sequelEpisodeCount
    const total_ = item.sequelEpisodeCount
    const hasEps = aired != null && total_ != null && total_ > 0
    const pct = hasEps ? Math.min(100, Math.round((aired / total_) * 100)) : 0

    const progressHtml = hasEps ? `
      <div style="margin-top:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span style="font-size:11px;color:#64748b;">${aired}<span style="color:#374151;"> / ${total_} פרקים</span></span>
          <span style="font-size:10px;color:#374151;font-family:'Courier New',monospace;">${pct}%</span>
        </div>
        <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;direction:ltr;">
          <div style="width:${pct || 2}%;height:100%;background:linear-gradient(to right,#8a0d42,#e0176b);border-radius:2px;"></div>
        </div>
      </div>` : aired > 0 ? `<div style="margin-top:8px;font-size:11px;color:#64748b;">${aired} פרקים</div>` : ''

    const nextHtml = item.nextAiringEpisode ? `
      <div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding:7px 10px;background:rgba(74,222,128,0.05);border:1px solid rgba(74,222,128,0.12);border-radius:8px;">
        <div style="width:5px;height:5px;border-radius:50%;background:#4ade80;flex-shrink:0;"></div>
        <span style="font-size:12px;color:#64748b;">פרק <strong style="color:#4ade80;">${item.nextAiringEpisode.episode}</strong> · ${formatAiringDate(item.nextAiringEpisode.airingAt)}</span>
      </div>` : ''

    const dotsHtml = item.seasons.length > 1 ? `
      <div style="display:flex;gap:3px;margin-top:10px;flex-wrap:wrap;">${buildSeasonDots(item.seasons, item.sequelId)}</div>` : ''

    return `
    <div class="rc-wrap card" style="margin:0 12px 10px;background:#111827;border-radius:14px;border:1px solid rgba(224,23,107,0.15);overflow:hidden;display:flex;">
      <div class="rc-cover" style="width:90px;flex-shrink:0;overflow:hidden;min-height:140px;">${coverHtml}</div>
      <div class="rc-body" style="flex:1;min-width:0;padding:14px 14px 12px;">
        ${badge}
        <div class="rc-title" style="font-size:16px;font-weight:700;color:#f1f5f9;line-height:1.3;">${item.hebrewTitle}</div>
        ${item.sequelTitle ? `<div style="font-size:10px;color:#374151;font-family:'Courier New',monospace;direction:ltr;text-align:right;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.sequelTitle}</div>` : ''}
        ${nextHtml}
        ${progressHtml}
        ${dotsHtml}
      </div>
    </div>`
  }).join('')

  const announcedCards = announced.map(item => {
    const idx = item.seasons.findIndex(s => s.id === item.sequelId)
    const seasonNum = idx >= 0 ? idx + 1 : null
    const dateVal = formatMonthYear(item.startDate.year, item.startDate.month)
    const hasTBA = dateVal === 'TBA'
    return `
    <div class="card" style="margin:0 12px 8px;background:#111827;border-radius:12px;border:1px solid rgba(251,191,36,0.15);padding:14px 14px 12px;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          ${seasonNum ? `<span style="display:inline-block;font-size:9px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);padding:2px 7px;border-radius:4px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">עונה ${seasonNum}</span>` : ''}
          <div style="font-size:15px;font-weight:700;color:#f1f5f9;line-height:1.3;">${item.hebrewTitle}</div>
          ${item.englishTitle && item.englishTitle !== item.hebrewTitle ? `<div style="font-size:10px;color:#374151;font-family:'Courier New',monospace;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.englishTitle}</div>` : ''}
        </div>
        <div style="flex-shrink:0;text-align:center;min-width:52px;">
          <div style="font-size:${hasTBA ? '12px' : '17px'};font-weight:800;color:${hasTBA ? '#4b5563' : '#fbbf24'};line-height:1.1;">${dateVal}</div>
          <div style="font-size:9px;color:#4b5563;margin-top:3px;">${hasTBA ? 'TBA' : 'פרסום'}</div>
        </div>
      </div>
      ${item.sequelEpisodeCount ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.04);"><span style="font-size:11px;color:#4b5563;">${item.sequelEpisodeCount} פרקים צפויים</span></div>` : ''}
    </div>`
  }).join('')

  const availableCards = avail.map(a => {
    const seasonCtx = (a.currentSeasonNumber && a.totalSeasons)
      ? ` · עונה ${a.currentSeasonNumber}/${a.totalSeasons}`
      : ''
    return `
    <div class="card" style="margin:0 12px 8px;background:#111827;border-radius:12px;border:1px solid rgba(74,222,128,0.15);padding:13px 14px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:150px;">
          <div style="font-size:15px;font-weight:700;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.sequelTitle}</div>
          <div style="font-size:11px;color:#4b5563;margin-top:3px;">המשך של <span style="color:#64748b;">${a.parentTitle}</span>${seasonCtx} · כל הפרקים זמינים</div>
        </div>
        <a href="${a.anilistId ? `https://anilist.co/anime/${a.anilistId}` : '#'}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;padding:7px 14px;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.2);border-radius:8px;text-decoration:none;color:#4ade80;font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0;">צפה ↗</a>
      </div>
    </div>`
  }).join('')

  const subtitleParts: string[] = []
  if (releasing.length > 0) subtitleParts.push(`${releasing.length} בשידור`)
  if (announced.length > 0) subtitleParts.push(`${announced.length} הוכרזו`)
  if (avail.length > 0) subtitleParts.push(`${avail.length} ממתין`)

  const pillsHtml = [
    releasing.length > 0 ? `<div style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:rgba(224,23,107,0.09);border:1px solid rgba(224,23,107,0.2);border-radius:20px;"><div style="width:6px;height:6px;border-radius:50%;background:#e0176b;flex-shrink:0;"></div><span style="font-size:11px;font-weight:700;color:#e0176b;">${releasing.length} בשידור</span></div>` : '',
    announced.length > 0 ? `<div style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.18);border-radius:20px;"><div style="width:6px;height:6px;border-radius:50%;background:#fbbf24;flex-shrink:0;"></div><span style="font-size:11px;font-weight:700;color:#fbbf24;">${announced.length} הוכרזו</span></div>` : '',
    avail.length > 0 ? `<div style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:rgba(74,222,128,0.07);border:1px solid rgba(74,222,128,0.18);border-radius:20px;"><div style="width:6px;height:6px;border-radius:50%;background:#4ade80;flex-shrink:0;"></div><span style="font-size:11px;font-weight:700;color:#4ade80;">${avail.length} ממתין</span></div>` : '',
  ].filter(Boolean).join('')

  function sectionHdr(color: string, label: string): string {
    return `<div class="section-hdr" style="padding:20px 20px 12px;display:flex;align-items:center;gap:10px;"><div style="flex:1;height:1px;background:linear-gradient(to left,${color}55,transparent);"></div><span style="font-size:9px;font-weight:700;color:${color};letter-spacing:0.16em;text-transform:uppercase;white-space:nowrap;padding:0 4px;">${label}</span><div style="flex:1;height:1px;background:linear-gradient(to right,${color}55,transparent);"></div></div>`
  }

  const releasingSection = releasing.length > 0 ? `${sectionHdr('#e0176b', 'בשידור כעת')}${releasingCards}` : ''
  const announcedSection = announced.length > 0 ? `${sectionHdr('#fbbf24', 'הוכרזה עונה')}${announcedCards}` : ''
  const availableSection = avail.length > 0 ? `${sectionHdr('#4ade80', 'ממתין לצפייה')}${availableCards}` : ''

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🎌 עדכון חודשי — ${subtitleParts.join(' · ')}`,
    html: `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;900&display=swap" rel="stylesheet">
<style>
  @media (max-width: 480px) {
    .rc-wrap { flex-direction: column !important; }
    .rc-cover { width: 100% !important; height: 170px !important; min-height: unset !important; }
    .rc-cover img, .rc-cover div { height: 170px !important; min-height: unset !important; }
    .rc-body { padding: 12px 12px 10px !important; }
    .rc-title { font-size: 14px !important; }
    .card { margin-left: 8px !important; margin-right: 8px !important; }
    .section-hdr { padding: 16px 12px 10px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#070710;font-family:'Heebo',Arial,sans-serif;direction:rtl;-webkit-text-size-adjust:100%;">
<div style="max-width:480px;margin:0 auto;padding-bottom:32px;">

  <div style="padding:28px 20px 0;">
    <div style="font-size:10px;color:#e0176b;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:12px;font-family:'Courier New',monospace;">ANIME TRACKER</div>
    <div style="font-size:30px;font-weight:900;color:#f1f5f9;line-height:1.1;">עדכון <span style="color:#e0176b;">חודשי</span></div>
    <div style="font-size:13px;color:#64748b;margin-top:8px;font-weight:300;">${new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</div>
  </div>

  <div style="padding:16px 20px 4px;display:flex;gap:8px;flex-wrap:wrap;">${pillsHtml}</div>

  ${releasingSection}
  ${announcedSection}
  ${availableSection}

  <div style="margin:20px 12px 0;padding:16px 20px;border-top:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:11px;color:#374151;">AniList API</span>
    <span style="font-size:10px;color:#374151;letter-spacing:0.15em;font-family:'Courier New',monospace;">ANIME TRACKER</span>
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
