import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

function verifyToken(userId: string, token: string): boolean {
  const secret = process.env.ADMIN_SECRET
  if (!secret) {
    console.error('[admin/deny] ADMIN_SECRET is not set — refusing token verification')
    return false
  }
  const expected = crypto.createHmac('sha256', secret).update(userId).digest('hex')
  return token === expected
}

function htmlPage(title: string, body: string, color: string) {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;background:#0f0f1a;font-family:system-ui,Arial,sans-serif;color:#d1ddf9;display:flex;align-items:center;justify-content:center;min-height:100vh;direction:rtl;}
  .card{background:#13131f;border:1px solid ${color}33;border-radius:20px;padding:40px 32px;max-width:400px;text-align:center;}
  .icon{font-size:48px;margin-bottom:16px;}
  h1{color:${color};font-size:22px;margin:0 0 12px;}
  p{color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;margin:0;}
</style>
</head>
<body>
<div class="card">
  ${body}
</div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const token = searchParams.get('token')

  if (!userId || !token) {
    return htmlPage(
      'שגיאה',
      '<div class="icon">⚠️</div><h1>קישור לא תקין</h1><p>חסרים פרמטרים בקישור.</p>',
      '#f87171'
    )
  }

  if (!verifyToken(userId, token)) {
    return htmlPage(
      'שגיאה',
      '<div class="icon">🔒</div><h1>אימות נכשל</h1><p>הטוקן אינו תקין או פג תוקפו.</p>',
      '#f87171'
    )
  }

  const approval = await prisma.userApproval.findUnique({ where: { clerkUserId: userId } })

  if (!approval) {
    return htmlPage(
      'שגיאה',
      '<div class="icon">❓</div><h1>משתמש לא נמצא</h1><p>לא נמצאה בקשת גישה עבור משתמש זה.</p>',
      '#f87171'
    )
  }

  if (approval.status === 'DENIED') {
    return htmlPage(
      'כבר נדחה',
      `<div class="icon">✕</div><h1>כבר נדחה</h1><p>הבקשה של <strong style="color:#d1ddf9">${approval.email}</strong> כבר נדחתה.</p>`,
      '#f87171'
    )
  }

  if (approval.status === 'APPROVED') {
    return htmlPage(
      'כבר מאושר',
      `<div class="icon">✅</div><h1>לא ניתן לדחות</h1><p>המשתמש <strong style="color:#d1ddf9">${approval.email}</strong> כבר קיבל גישה ואושר. לדחייה השתמש בפאנל הניהול.</p>`,
      '#f59e0b'
    )
  }

  await prisma.userApproval.update({
    where: { clerkUserId: userId },
    data: { status: 'DENIED' },
  })

  return htmlPage(
    'נדחה',
    `<div class="icon">✕</div><h1>בקשה נדחתה</h1><p>הגישה של <strong style="color:#d1ddf9">${approval.email}</strong> נדחתה.</p>`,
    '#f87171'
  )
}
