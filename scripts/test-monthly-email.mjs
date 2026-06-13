// One-time test script — delete after use
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import nodemailer from 'nodemailer'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '..', '.env.local')

// Parse .env.local manually
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
}

const { EMAIL_USER, EMAIL_PASS, ADMIN_EMAIL, NOTIFY_EMAIL } = process.env
const to = ADMIN_EMAIL ?? NOTIFY_EMAIL
if (!EMAIL_USER || !EMAIL_PASS || !to) {
  console.error('Missing email config'); process.exit(1)
}

const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: EMAIL_USER, pass: EMAIL_PASS } })

function formatAiringDate(ts) {
  const d = new Date(ts * 1000)
  const date = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' })
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })
  return `${date}, ${time}`
}

// Sample upcoming episodes (next 3 weeks from now)
const now = Math.floor(Date.now() / 1000)
const week = 7 * 24 * 3600
const upcomingEpisodes = [
  { episode: 8, airingAt: now + 2 * 24 * 3600 },
  { episode: 9, airingAt: now + week + 2 * 24 * 3600 },
  { episode: 10, airingAt: now + 2 * week + 2 * 24 * 3600 },
]

const releasingCard = `
<div class="rc-wrap card" style="margin:0 12px 10px;background:#111827;border-radius:14px;border:1px solid rgba(224,23,107,0.15);overflow:hidden;display:flex;">
  <div class="rc-cover" style="width:76px;flex-shrink:0;overflow:hidden;">
    <div style="width:76px;min-height:107px;background:#0d1117;display:flex;align-items:center;justify-content:center;font-size:28px;">🎌</div>
  </div>
  <div class="rc-body" style="flex:1;min-width:0;padding:14px 14px 12px;min-height:107px;box-sizing:border-box;">
    <span style="display:inline-block;background:rgba(224,23,107,0.1);border:1px solid rgba(224,23,107,0.28);color:#e0176b;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:9px;">▶ AIRING · עונה 3</span>
    <div class="rc-title" style="font-size:16px;font-weight:700;color:#f1f5f9;line-height:1.3;">שומר הלהבות</div>
    <div style="font-size:10px;color:#374151;font-family:'Courier New',monospace;direction:ltr;text-align:right;margin-top:2px;">Demon Slayer: Kimetsu no Yaiba</div>
    <div style="margin-top:8px;">
      <div style="font-size:10px;color:#4b5563;margin-bottom:3px;letter-spacing:0.06em;">פרקים קרובים</div>
      ${upcomingEpisodes.map(ep => `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;padding:5px 8px;background:rgba(74,222,128,0.05);border:1px solid rgba(74,222,128,0.1);border-radius:6px;"><div style="width:4px;height:4px;border-radius:50%;background:#4ade80;flex-shrink:0;"></div><span style="font-size:11px;color:#64748b;">פרק <strong style="color:#4ade80;">${ep.episode}</strong> · ${formatAiringDate(ep.airingAt)}</span></div>`).join('')}
    </div>
  </div>
</div>`

const announcedCard = `
<div class="card" style="margin:0 12px 8px;background:#111827;border-radius:12px;border:1px solid rgba(251,191,36,0.15);overflow:hidden;display:flex;">
  <div style="width:76px;flex-shrink:0;overflow:hidden;">
    <div style="width:76px;min-height:107px;background:#1f2937;"></div>
  </div>
  <div style="flex:1;min-width:0;padding:14px 14px 12px;min-height:107px;box-sizing:border-box;">
    <span style="display:inline-block;font-size:9px;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);padding:2px 7px;border-radius:4px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px;">עונה 2</span>
    <div style="font-size:15px;font-weight:700;color:#f1f5f9;line-height:1.3;">קרב הטיטאנים</div>
    <div style="font-size:10px;color:#374151;font-family:'Courier New',monospace;margin-top:2px;">Attack on Titan: Final Season Part 3</div>
    <div style="font-size:11px;color:#4b5563;margin-top:8px;">1 עונות קיימות</div>
    <div style="margin-top:8px;padding:6px 8px;background:rgba(251,191,36,0.06);border-radius:6px;border:1px solid rgba(251,191,36,0.12);">
      <div style="font-size:9px;color:#4b5563;margin-bottom:2px;letter-spacing:0.06em;">תאריך פרסום</div>
      <div style="font-size:13px;font-weight:700;color:#fbbf24;">15 ינואר 2026</div>
    </div>
    <div style="margin-top:5px;font-size:11px;color:#4b5563;">16 פרקים צפויים</div>
  </div>
</div>`

const availableCard = `
<div class="card" style="margin:0 12px 8px;background:#111827;border-radius:12px;border:1px solid rgba(74,222,128,0.15);overflow:hidden;display:flex;">
  <div style="width:76px;flex-shrink:0;overflow:hidden;">
    <div style="width:76px;min-height:107px;background:#1f2937;"></div>
  </div>
  <div style="flex:1;min-width:0;padding:14px;min-height:107px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;">
    <div style="font-size:15px;font-weight:700;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Jujutsu Kaisen Season 2</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px;">המשך של Jujutsu Kaisen · עונה 1/3</div>
    <div style="font-size:11px;color:#4ade80;margin-top:4px;">כל הפרקים זמינים ✓</div>
  </div>
</div>`

function sectionHdr(color, label) {
  return `<div class="section-hdr" style="padding:20px 20px 12px;display:flex;align-items:center;gap:10px;"><div style="flex:1;height:1px;background:linear-gradient(to left,${color}55,transparent);"></div><span style="font-size:9px;font-weight:700;color:${color};letter-spacing:0.16em;text-transform:uppercase;white-space:nowrap;padding:0 4px;">${label}</span><div style="flex:1;height:1px;background:linear-gradient(to right,${color}55,transparent);"></div></div>`
}

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700;900&display=swap" rel="stylesheet">
<style>
  @media (max-width: 480px) {
    .rc-wrap { flex-direction: column !important; }
    .rc-cover { width: 100% !important; }
    .card { margin-left: 8px !important; margin-right: 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#070710;font-family:'Heebo',Arial,sans-serif;direction:rtl;">
<div style="max-width:480px;margin:0 auto;padding-bottom:32px;">

  <div style="padding:28px 20px 0;text-align:center;">
    <div style="font-size:10px;color:#e0176b;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;margin-bottom:12px;font-family:'Courier New',monospace;">ANIME TRACKER</div>
    <div style="font-size:30px;font-weight:900;color:#f1f5f9;line-height:1.1;">עדכון <span style="color:#e0176b;">חודשי</span></div>
    <div style="font-size:13px;color:#64748b;margin-top:8px;font-weight:300;">[מייל בדיקה — עיצוב מעודכן]</div>
  </div>

  <div style="padding:16px 20px 4px;display:flex;gap:8px;flex-wrap:wrap;">
    <div style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:rgba(224,23,107,0.09);border:1px solid rgba(224,23,107,0.2);border-radius:20px;"><div style="width:6px;height:6px;border-radius:50%;background:#e0176b;"></div><span style="font-size:11px;font-weight:700;color:#e0176b;">1 בשידור</span></div>
    <div style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.18);border-radius:20px;"><div style="width:6px;height:6px;border-radius:50%;background:#fbbf24;"></div><span style="font-size:11px;font-weight:700;color:#fbbf24;">1 הוכרזו</span></div>
    <div style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;background:rgba(74,222,128,0.07);border:1px solid rgba(74,222,128,0.18);border-radius:20px;"><div style="width:6px;height:6px;border-radius:50%;background:#4ade80;"></div><span style="font-size:11px;font-weight:700;color:#4ade80;">1 ממתין</span></div>
  </div>

  ${sectionHdr('#e0176b', 'בשידור כעת')}
  ${releasingCard}

  ${sectionHdr('#fbbf24', 'הוכרזה עונה')}
  ${announcedCard}

  ${sectionHdr('#4ade80', 'ממתין לצפייה')}
  ${availableCard}

  <div style="margin:20px 12px 0;padding:16px 20px;border-top:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:11px;color:#374151;">AniList API</span>
    <span style="font-size:10px;color:#374151;letter-spacing:0.15em;font-family:'Courier New',monospace;">ANIME TRACKER</span>
  </div>

</div>
</body>
</html>`

await transport.sendMail({
  from: `"Anime Tracker" <${EMAIL_USER}>`,
  to,
  subject: '🎌 [בדיקה] עדכון חודשי — עיצוב מעודכן',
  html,
})

console.log(`✓ מייל בדיקה נשלח ל-${to}`)
