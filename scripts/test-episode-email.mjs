// Quick test script for sendNewEpisodeEmail
// Run: node --env-file=.env.local scripts/test-episode-email.mjs

import nodemailer from 'nodemailer'

const { EMAIL_USER, EMAIL_PASS, NOTIFY_EMAIL } = process.env

if (!EMAIL_USER || !EMAIL_PASS || !NOTIFY_EMAIL) {
  console.error('Missing EMAIL_USER / EMAIL_PASS / NOTIFY_EMAIL in env')
  process.exit(1)
}

const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: EMAIL_USER, pass: EMAIL_PASS } })

const NOW = Math.floor(Date.now() / 1000)
const DAY = 86400

function fmtDate(ts) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === now.toDateString()) return 'היום!'
  if (d.toDateString() === tomorrow.toDateString()) return 'מחר'
  return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' })
}

function upcomingColor(ts) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  if (d.toDateString() === now.toDateString()) return '#f472b6'
  if (d.toDateString() === tomorrow.toDateString()) return '#fbbf24'
  return '#60a5fa'
}

const newEpisodes = [
  {
    mediaId: 101,
    title: 'Demon Slayer: Kimetsu no Yaiba',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-PEn1CTc93blC.jpg',
    episode: 12,
    airingAt: NOW - 3600,
    upcoming: [
      { episode: 13, airingAt: NOW + DAY },
      { episode: 14, airingAt: NOW + 8 * DAY },
      { episode: 15, airingAt: NOW + 15 * DAY },
    ],
  },
  {
    mediaId: 202,
    title: 'My Hero Academia',
    coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21459-nYTQpQFPa1FC.jpg',
    episode: 7,
    airingAt: NOW - 7200,
    upcoming: [
      { episode: 8, airingAt: NOW + 7 * DAY },
    ],
  },
]

const cards = newEpisodes.map(ep => {
  const cover = ep.coverImage
    ? `<img src="${ep.coverImage}" alt="" style="width:54px;height:76px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
    : `<div style="width:54px;height:76px;background:#1f2937;border-radius:8px;flex-shrink:0;"></div>`

  const upcomingRows = ep.upcoming.slice(0, 3).map(u => {
    const color = upcomingColor(u.airingAt)
    const label = fmtDate(u.airingAt)
    return `<div style="font-size:11px;color:${color};margin-top:3px;">פרק ${u.episode} — ${label}</div>`
  }).join('')

  return `
  <div style="display:flex;align-items:flex-start;gap:14px;background:#111827;border:1px solid rgba(74,222,128,0.18);border-radius:14px;padding:14px;margin-bottom:12px;">
    ${cover}
    <div style="flex:1;min-width:0;">
      <div style="font-size:15px;font-weight:700;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ep.title}</div>
      <div style="display:inline-flex;align-items:center;gap:6px;margin-top:6px;padding:5px 10px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:8px;">
        <div style="width:6px;height:6px;border-radius:50%;background:#4ade80;flex-shrink:0;"></div>
        <span style="font-size:13px;color:#4ade80;font-weight:700;">פרק ${ep.episode} יצא — ${fmtDate(ep.airingAt)}</span>
      </div>
      ${ep.upcoming.length > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05);">${upcomingRows}</div>` : ''}
    </div>
  </div>`
}).join('')

const html = `<!DOCTYPE html>
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
    <div style="font-size:28px;font-weight:900;color:#f1f5f9;line-height:1.1;">פרקים <span style="color:#4ade80;">חדשים</span></div>
    <div style="font-size:13px;color:#64748b;margin-top:6px;font-weight:300;">${newEpisodes.length} סדרות עם פרק חדש</div>
  </div>

  <div style="padding:0 12px 8px;">${cards}</div>

  <div style="margin:20px 12px 0;padding:16px 20px;border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
    <span style="font-size:10px;color:#374151;letter-spacing:0.15em;font-family:'Courier New',monospace;">ANIME TRACKER · TEST EMAIL</span>
  </div>

</div>
</body>
</html>`

console.log('Sending test email to', NOTIFY_EMAIL, '...')

await transport.sendMail({
  from: `"Anime Tracker" <${EMAIL_USER}>`,
  to: NOTIFY_EMAIL,
  subject: `🎌 [TEST] פרקים חדשים — Demon Slayer · My Hero Academia`,
  html,
})

console.log('✓ Test email sent successfully!')
