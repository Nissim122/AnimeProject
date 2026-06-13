import nodemailer from 'nodemailer'
import type { AnimeResult } from './anilist'


function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

interface ImageAttachment {
  cid: string
  content: Buffer
  contentType: string
  contentDisposition: 'inline'
}

async function fetchImageAttachments(urls: (string | null | undefined)[]): Promise<{
  urlToCid: Map<string, string>
  attachments: ImageAttachment[]
}> {
  const unique = [...new Set(urls.filter((u): u is string => !!u))]
  const urlToCid = new Map<string, string>()
  const attachments: ImageAttachment[] = []

  await Promise.all(unique.map(async (url, i) => {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      })
      if (!res.ok) return
      const buffer = Buffer.from(await res.arrayBuffer())
      const contentType = res.headers.get('content-type') || 'image/jpeg'
      const cid = `cover${i}@anime`
      urlToCid.set(url, cid)
      attachments.push({ cid, content: buffer, contentType, contentDisposition: 'inline' })
    } catch { /* skip failed images */ }
  }))

  return { urlToCid, attachments }
}

function cidOrUrl(url: string, urlToCid: Map<string, string>): string {
  const cid = urlToCid.get(url)
  return cid ? `cid:${cid}` : url
}



export async function sendConsolidatedMonthlyEmail(params: {
  items: Array<{
    hebrewTitle: string
    englishTitle: string
    sequelTitle: string
    coverImage?: string
    status: string
    nextAiringEpisode?: { episode: number; airingAt: number } | null
    upcomingEpisodes?: { episode: number; airingAt: number }[]
    sequelEpisodeCount?: number | null
    totalSeasons?: number
    existingSeasonCount?: number
    sequelId: number
    startDate: { year: number | null; month: number | null; day: number | null }
    seasons: AnimeResult[]
  }>
  available?: Array<{ parentTitle: string; sequelTitle: string; currentSeasonNumber?: number; totalSeasons?: number; anilistId?: number; coverImage?: string }>
  toEmail?: string
}): Promise<boolean> {
  const transport = createTransport()
  const to = params.toEmail ?? getTo()
  if (!transport || !to) {
    console.warn('[mailer] Missing email config — skipping')
    return false
  }

  const { items, available } = params
  const avail = available ?? []

  const { urlToCid, attachments: imgAttachments } = await fetchImageAttachments([
    ...items.map(i => i.coverImage),
    ...avail.map(a => a.coverImage),
  ])

  const releasing = items.filter(i => i.status === 'RELEASING')
  const announced = items
    .filter(i => i.status === 'NOT_YET_RELEASED')
    .sort((a, b) => {
      const key = (d: typeof a.startDate) =>
        !d.year ? Number.MAX_SAFE_INTEGER : d.year * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31)
      return key(a.startDate) - key(b.startDate)
    })
  const total = releasing.length + announced.length + avail.length

  function formatAiringDate(ts: number): string {
    const d = new Date(ts * 1000)
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' })
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
    const titleLine = seasonNum ? `${item.hebrewTitle} - עונה ${seasonNum}` : item.hebrewTitle

    const coverHtml = (item.coverImage && urlToCid.has(item.coverImage))
      ? `<img src="cid:${urlToCid.get(item.coverImage)}" alt="" width="90" style="width:90px;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:90px;background:#0d1117;"></div>`

    const episodesToShow = item.upcomingEpisodes?.length
      ? item.upcomingEpisodes
      : item.nextAiringEpisode
        ? [item.nextAiringEpisode]
        : []
    const episodeRows = episodesToShow.map(ep =>
      `<div style="font-size:12px;color:#94a3b8;margin-top:5px;">פרק ${ep.episode} - ${formatAiringDate(ep.airingAt)}</div>`
    ).join('')

    return `
    <div class="rc-wrap card" style="margin:0 12px 10px;background:#111827;border-radius:14px;border:1px solid rgba(224,23,107,0.15);overflow:hidden;display:flex;min-height:110px;">
      <div class="rc-cover" style="width:90px;flex-shrink:0;overflow:hidden;align-self:stretch;">${coverHtml}</div>
      <div class="rc-body" style="flex:1;min-width:0;padding:14px 14px 14px;">
        <div class="rc-title" style="font-size:15px;font-weight:700;color:#f1f5f9;line-height:1.3;">${titleLine}</div>
        <div style="margin-top:6px;">${episodeRows}</div>
      </div>
    </div>`
  }).join('')

  const announcedCards = announced.map(item => {
    const idx = item.seasons.findIndex(s => s.id === item.sequelId)
    const seasonNum = idx >= 0 ? idx + 1 : null
    const titleLine = seasonNum ? `${item.hebrewTitle} - עונה ${seasonNum}` : item.hebrewTitle
    const dateVal = formatDateHe(item.startDate)

    const coverHtml = (item.coverImage && urlToCid.has(item.coverImage))
      ? `<img src="cid:${urlToCid.get(item.coverImage)}" alt="" width="90" style="width:90px;height:100%;object-fit:cover;display:block;" />`
      : `<div style="width:90px;background:#1f2937;"></div>`

    return `
    <div class="card" style="margin:0 12px 8px;background:#111827;border-radius:14px;border:1px solid rgba(251,191,36,0.15);overflow:hidden;display:flex;min-height:110px;">
      <div style="width:90px;flex-shrink:0;overflow:hidden;align-self:stretch;">${coverHtml}</div>
      <div style="flex:1;min-width:0;padding:14px 14px 14px;">
        <div style="font-size:15px;font-weight:700;color:#f1f5f9;line-height:1.3;">${titleLine}</div>
        <div style="margin-top:8px;">
          ${(item.existingSeasonCount ?? 0) > 0 ? `<div style="font-size:12px;color:#94a3b8;margin-top:5px;">${item.existingSeasonCount} עונות קיימות</div>` : ''}
          ${item.sequelEpisodeCount ? `<div style="font-size:12px;color:#94a3b8;margin-top:5px;">${item.sequelEpisodeCount} פרקים קיימים</div>` : ''}
        </div>
        <div style="font-size:12px;color:#fbbf24;margin-top:10px;">${dateVal}</div>
      </div>
    </div>`
  }).join('')

  const availableCards = avail.map(a => {
    const seasonCtx = (a.currentSeasonNumber && a.totalSeasons)
      ? ` · עונה ${a.currentSeasonNumber}/${a.totalSeasons}`
      : ''
    const coverHtml = (a.coverImage && urlToCid.has(a.coverImage))
      ? `<img src="cid:${urlToCid.get(a.coverImage)}" alt="" width="76" height="107" style="width:76px;height:107px;object-fit:cover;display:block;" />`
      : `<div style="width:76px;height:107px;background:#1f2937;"></div>`
    return `
    <div class="card" style="margin:0 12px 8px;background:#111827;border-radius:12px;border:1px solid rgba(74,222,128,0.15);overflow:hidden;display:flex;">
      <div style="width:76px;height:107px;flex-shrink:0;overflow:hidden;align-self:flex-start;">${coverHtml}</div>
      <div style="flex:1;min-width:0;padding:14px;min-height:107px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;">
        <div style="font-size:15px;font-weight:700;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.sequelTitle}</div>
        <div style="font-size:11px;color:#4ade80;margin-top:4px;">כל הפרקים זמינים ✓</div>
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
    attachments: imgAttachments,
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
    .rc-cover { width: 100% !important; height: 170px !important; align-self: auto !important; overflow: hidden !important; }
    .rc-cover img { width: 100% !important; height: 170px !important; object-fit: cover !important; }
    .rc-body { padding: 12px 12px 10px !important; }
    .rc-title { font-size: 14px !important; }
    .card { margin-left: 8px !important; margin-right: 8px !important; }
    .section-hdr { padding: 16px 12px 10px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#070710;font-family:'Heebo',Arial,sans-serif;direction:rtl;-webkit-text-size-adjust:100%;">
<div style="max-width:480px;margin:0 auto;padding-bottom:32px;">

  <div style="padding:28px 20px 0;text-align:center;">
    <div style="font-size:10px;color:#e0176b;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:12px;font-family:'Courier New',monospace;">ANIME TRACKER</div>
    <div style="font-size:30px;font-weight:900;color:#f1f5f9;line-height:1.1;">עדכון <span style="color:#e0176b;">חודשי</span></div>
    <div style="font-size:13px;color:#64748b;margin-top:8px;font-weight:300;">${new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</div>
  </div>

  <div style="padding:16px 20px 4px;display:flex;gap:8px;flex-wrap:wrap;">${pillsHtml}</div>

  ${releasingSection}
  ${announcedSection}
  ${availableSection}


</div>
</body>
</html>`,
  })

  console.log(`[mailer] Consolidated monthly email sent (${total} items)`)
  return true
}

const MONTHS_HE_MAIL = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

function formatDateHe(d: { year: number | null; month: number | null; day: number | null }): string {
  if (!d.year) return 'בקרוב'
  if (d.month && d.day) return `${d.day} ${MONTHS_HE_MAIL[d.month - 1]} ${d.year}`
  if (d.month) return `${MONTHS_HE_MAIL[d.month - 1]} ${d.year}`
  return String(d.year)
}

export async function sendUpdatesEmail(params: {
  watching:  Array<{ parentTitle: string; coverImage?: string; sequelTitle: string }>
  releasing: Array<{ parentTitle: string; coverImage?: string; upcomingEpisodes?: { episode: number; airingAt: number }[] }>
  upcoming:  Array<{ parentTitle: string; coverImage?: string; startDate: { year: number | null; month: number | null; day: number | null } }>
  toEmail: string
}): Promise<boolean> {
  const transport = createTransport()
  const { watching, releasing, upcoming, toEmail } = params
  if (!transport || !toEmail) {
    console.warn('[mailer] Missing email config — skipping')
    return false
  }

  const total = watching.length + releasing.length + upcoming.length
  if (total === 0) return false

  const { urlToCid: updUrlToCid, attachments: updAttachments } = await fetchImageAttachments([
    ...watching.map(i => i.coverImage),
    ...releasing.map(i => i.coverImage),
    ...upcoming.map(i => i.coverImage),
  ])

  function coverImg(url?: string): string {
    return url
      ? `<img src="${cidOrUrl(url, updUrlToCid)}" alt="" style="width:32px;height:44px;object-fit:cover;border-radius:4px;flex-shrink:0;" />`
      : `<div style="width:32px;height:44px;background:#1f2937;border-radius:4px;flex-shrink:0;"></div>`
  }

  function item(coverImage: string | undefined, title: string, statusColor: string, statusLine: string): string {
    return `
    <div style="display:flex;align-items:center;gap:12px;background:rgba(31,41,55,0.5);border-radius:10px;padding:8px 12px;margin-bottom:8px;">
      ${coverImg(coverImage)}
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</div>
        <div style="font-size:12px;color:${statusColor};margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${statusLine}</div>
      </div>
    </div>`
  }

  function section(icon: string, label: string, color: string, count: number, cards: string): string {
    return `
    <div style="padding:16px 12px 4px;">
      <div style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.12em;display:flex;align-items:center;gap:6px;margin-bottom:10px;">
        ${icon} ${label}
        <span style="background:#1f2937;border-radius:9999px;padding:1px 8px;">${count}</span>
      </div>
      ${cards}
    </div>`
  }

  const watchingSection = watching.length > 0 ? section(
    '📺', 'צופה', '#a78bfa', watching.length,
    watching.map(i => item(i.coverImage, i.parentTitle, '#a78bfa', `📺 ${i.sequelTitle}`)).join('')
  ) : ''

  function releasingItem(i: { parentTitle: string; coverImage?: string; upcomingEpisodes?: { episode: number; airingAt: number }[] }): string {
    const episodeRows = (i.upcomingEpisodes ?? []).map(ep => {
      const d = new Date(ep.airingAt * 1000)
      const now = new Date()
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
      let label: string; let color: string
      if (d.toDateString() === now.toDateString())      { label = 'היום!'; color = '#f472b6' }
      else if (d.toDateString() === tomorrow.toDateString()) { label = 'מחר';  color = '#fbbf24' }
      else { label = d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' }); color = '#60a5fa' }
      return `<div style="font-size:11px;color:${color};margin-top:3px;">פרק ${ep.episode} — ${label}</div>`
    }).join('')
    return `
    <div style="display:flex;align-items:flex-start;gap:12px;background:rgba(31,41,55,0.5);border-radius:10px;padding:8px 12px;margin-bottom:8px;">
      ${i.coverImage ? `<img src="${cidOrUrl(i.coverImage, updUrlToCid)}" alt="" style="width:32px;height:44px;object-fit:cover;border-radius:4px;flex-shrink:0;" />` : `<div style="width:32px;height:44px;background:#1f2937;border-radius:4px;flex-shrink:0;"></div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${i.parentTitle}</div>
        <div style="font-size:12px;color:#4ade80;margin-top:2px;">🟢 משודר כעת</div>
        ${episodeRows}
      </div>
    </div>`
  }

  const releasingSection = releasing.length > 0 ? section(
    '🟢', 'יוצאים פרקים חדשים', '#4ade80', releasing.length,
    releasing.map(i => releasingItem(i)).join('')
  ) : ''

  const upcomingSection = upcoming.length > 0 ? section(
    '📅', 'הוכרזה עונה', '#fbbf24', upcoming.length,
    upcoming.map(i => item(i.coverImage, i.parentTitle, '#fbbf24', `📅 ${formatDateHe(i.startDate)}`)).join('')
  ) : ''

  const pills = [
    watching.length  > 0 ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:20px;font-size:11px;font-weight:700;color:#a78bfa;">📺 ${watching.length} לצפייה</span>` : '',
    releasing.length > 0 ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;background:rgba(74,222,128,0.07);border:1px solid rgba(74,222,128,0.18);border-radius:20px;font-size:11px;font-weight:700;color:#4ade80;">🟢 ${releasing.length} בשידור</span>` : '',
    upcoming.length  > 0 ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.18);border-radius:20px;font-size:11px;font-weight:700;color:#fbbf24;">📅 ${upcoming.length} הוכרזו</span>` : '',
  ].filter(Boolean).join(' ')

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `🎌 עדכונים — ${total} סדרות`,
    attachments: updAttachments,
    html: `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;900&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#070710;font-family:'Heebo',Arial,sans-serif;direction:rtl;-webkit-text-size-adjust:100%;">
<div style="max-width:480px;margin:0 auto;padding-bottom:32px;">

  <div style="padding:28px 20px 16px;">
    <div style="font-size:10px;color:#e0176b;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:12px;font-family:'Courier New',monospace;">ANIME TRACKER</div>
    <div style="font-size:28px;font-weight:900;color:#f1f5f9;line-height:1.1;">עדכונים</div>
    <div style="font-size:13px;color:#64748b;margin-top:6px;font-weight:300;">${total} סדרות עם עדכון</div>
  </div>

  <div style="padding:0 12px 8px;display:flex;gap:8px;flex-wrap:wrap;">${pills}</div>

  ${watchingSection}
  ${releasingSection}
  ${upcomingSection}

  <div style="margin:20px 12px 0;padding:16px 20px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
    <span style="font-size:10px;color:#374151;letter-spacing:0.15em;font-family:'Courier New',monospace;">ANIME TRACKER</span>
  </div>

</div>
</body>
</html>`,
  })

  console.log(`[mailer] Updates email sent (${total} items)`)
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
  const safeUserName = escHtml(userName || '')
  const safeUserEmail = escHtml(userEmail)

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
    subject: `🔔 בקשת גישה חדשה — ${userName || userEmail}`,  // subjects are plain text, no escaping needed
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
      <span style="font-size:15px;color:#d1ddf9;font-weight:700;margin-right:8px;">${safeUserName || '—'}</span>
    </div>
    <div>
      <span style="font-size:12px;color:#888;">מייל:</span>
      <span style="font-size:15px;color:#e0176b;font-weight:700;margin-right:8px;">${safeUserEmail}</span>
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
  const safeUserName = escHtml(userName || '')
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
      ${safeUserName ? `שלום ${safeUserName}, ` : ''}הבקשה שלך אושרה ועכשיו יש לך גישה מלאה ל-Anime Tracker.
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

export async function sendNewEpisodeEmail(params: {
  newEpisodes: Array<{
    mediaId: number
    title: string
    coverImage: string | null
    episode: number
    airingAt: number
    upcoming: Array<{ episode: number; airingAt: number }>
  }>
  toEmail: string
}): Promise<boolean> {
  const transport = createTransport()
  const { newEpisodes, toEmail } = params
  if (!transport || !toEmail || newEpisodes.length === 0) {
    console.warn('[mailer] sendNewEpisodeEmail: missing config or empty list')
    return false
  }

  const { urlToCid: epUrlToCid, attachments: epAttachments } = await fetchImageAttachments(
    newEpisodes.map(e => e.coverImage)
  )

  function formatAiringFull(ts: number): string {
    const d = new Date(ts * 1000)
    const now = new Date()
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
    if (d.toDateString() === now.toDateString()) return 'היום!'
    if (d.toDateString() === tomorrow.toDateString()) return 'מחר'
    return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' })
  }

  function upcomingColor(ts: number): string {
    const d = new Date(ts * 1000)
    const now = new Date()
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
    if (d.toDateString() === now.toDateString()) return '#f472b6'
    if (d.toDateString() === tomorrow.toDateString()) return '#fbbf24'
    return '#60a5fa'
  }

  const cards = newEpisodes.map(ep => {
    const cover = ep.coverImage
      ? `<img src="${cidOrUrl(ep.coverImage, epUrlToCid)}" alt="" style="width:54px;height:76px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
      : `<div style="width:54px;height:76px;background:#1f2937;border-radius:8px;flex-shrink:0;"></div>`

    const upcomingRows = ep.upcoming.slice(0, 3).map(u => {
      const color = upcomingColor(u.airingAt)
      const label = formatAiringFull(u.airingAt)
      return `<div style="font-size:11px;color:${color};margin-top:3px;">פרק ${u.episode} — ${label}</div>`
    }).join('')

    return `
    <div style="display:flex;align-items:flex-start;gap:14px;background:#111827;border:1px solid rgba(74,222,128,0.18);border-radius:14px;padding:14px;margin-bottom:12px;">
      ${cover}
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ep.title}</div>
        <div style="display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:5px 10px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:8px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#4ade80;flex-shrink:0;"></div>
          <span style="font-size:13px;color:#4ade80;font-weight:700;">פרק ${ep.episode} יצא — ${formatAiringFull(ep.airingAt)}</span>
        </div>
        ${ep.upcoming.length > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05);">${upcomingRows}</div>` : ''}
      </div>
    </div>`
  }).join('')

  const subject = newEpisodes.length === 1
    ? `פרקים חדשים להיום - animeAI`
    : `פרקים חדשים להיום - animeAI`

  await transport.sendMail({
    from: `"Anime Tracker" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    attachments: epAttachments,
    html: `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;900&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#070710;font-family:'Heebo',Arial,sans-serif;direction:rtl;-webkit-text-size-adjust:100%;">
<div style="max-width:480px;margin:0 auto;padding-bottom:32px;">

  <div style="padding:28px 20px 16px;text-align:center;">
    <div style="font-size:28px;font-weight:900;color:#f1f5f9;line-height:1.1;">פרקים <span style="color:#4ade80;">חדשים</span></div>
    <div style="font-size:13px;color:#64748b;margin-top:6px;font-weight:300;">${newEpisodes.length} ${newEpisodes.length === 1 ? 'סדרה' : 'סדרות'} עם פרק חדש</div>
  </div>

  <div style="padding:0 12px 8px;">${cards}</div>

  <div style="margin:20px 12px 0;padding:16px 20px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
    <span style="font-size:10px;color:#374151;letter-spacing:0.15em;font-family:'Courier New',monospace;">animeAI</span>
  </div>

</div>
</body>
</html>`,
  })

  console.log(`[mailer] New episode email sent — ${newEpisodes.length} series`)
  return true
}

export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_EMAIL)
}
