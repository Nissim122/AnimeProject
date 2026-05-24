import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { sendApprovalRequestEmail } from '@/lib/mailer'
import { AutoRefresh, RefreshButton, SignOutButton } from './_components'
import crypto from 'crypto'

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function generateApprovalToken(userId: string): string {
  const secret = process.env.ADMIN_SECRET || 'change-this-secret'
  return crypto.createHmac('sha256', secret).update(userId).digest('hex')
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nisimelec77@gmail.com').toLowerCase().trim()

export default async function PendingPage() {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const clerkUser = await currentUser()
  const primaryEmail =
    clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    ''
  const userName =
    [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || primaryEmail

  // Admin auto-approve
  if (primaryEmail.toLowerCase().trim() === ADMIN_EMAIL) {
    await prisma.userApproval.upsert({
      where: { clerkUserId: userId },
      update: { status: 'APPROVED', email: primaryEmail, name: userName },
      create: {
        clerkUserId: userId,
        email: primaryEmail,
        name: userName,
        status: 'APPROVED',
        emailSentAt: new Date(),
      },
    })
    redirect('/')
  }

  let approval = await prisma.userApproval.findUnique({ where: { clerkUserId: userId } })

  if (!approval) {
    const baseUrl = getBaseUrl()
    const token = generateApprovalToken(userId)

    try {
      approval = await prisma.userApproval.create({
        data: {
          clerkUserId: userId,
          email: primaryEmail,
          name: userName,
          status: 'PENDING',
          emailSentAt: new Date(),
        },
      })
    } catch {
      // Race condition — another render already created the record
      approval = await prisma.userApproval.findUnique({ where: { clerkUserId: userId } })
    }

    // Send notification email to admin regardless of whether record was just created or already existed
    if (approval?.status === 'PENDING') {
      try {
        await sendApprovalRequestEmail({
          toAdmin: ADMIN_EMAIL,
          userEmail: primaryEmail,
          userName,
          adminUrl: `${baseUrl}/admin`,
          approveUrl: `${baseUrl}/api/admin/approve?userId=${userId}&token=${token}`,
          denyUrl: `${baseUrl}/api/admin/deny?userId=${userId}&token=${token}`,
        })
      } catch (err) {
        console.error('[pending] Failed to send approval request email:', err)
      }
    }
  }

  if (approval?.status === 'APPROVED') {
    redirect('/')
  }

  const isDenied = approval?.status === 'DENIED'

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0f0f1a' }}
      dir="rtl"
    >
      <AutoRefresh />
      <div
        className="w-full max-w-md text-center"
        style={{ fontFamily: 'system-ui, Arial, sans-serif' }}
      >
        {/* Logo */}
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-1">
            <span style={{ color: '#e0176b' }}>Anime</span>{' '}
            <span style={{ color: '#d1ddf9' }}>Tracker</span>
          </h1>
        </div>

        {isDenied ? (
          /* Denied state */
          <div
            className="rounded-2xl p-8"
            style={{
              background: '#13131f',
              border: '1px solid rgba(248,113,113,0.25)',
            }}
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 text-2xl"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}
            >
              ✕
            </div>
            <h2 className="text-xl font-bold mb-3" style={{ color: '#f87171' }}>
              הגישה נדחתה
            </h2>
            <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              בקשת הגישה שלך לא אושרה.
            </p>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
              לפרטים נוספים פנה אל{' '}
              <span style={{ color: '#e0176b' }}>{ADMIN_EMAIL}</span>
            </p>
            <SignOutButton />
          </div>
        ) : (
          /* Pending state */
          <div
            className="rounded-2xl p-8"
            style={{
              background: '#13131f',
              border: '1px solid rgba(224,23,107,0.2)',
            }}
          >
            {/* Spinner */}
            <div className="flex justify-center mb-6">
              <div
                className="w-14 h-14 rounded-full border-4 border-t-transparent animate-spin"
                style={{ borderColor: '#e0176b', borderTopColor: 'transparent' }}
              />
            </div>

            <h2 className="text-xl font-bold mb-3" style={{ color: '#d1ddf9' }}>
              הבקשה שלך בבדיקה
            </h2>
            <p className="text-sm mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              שלחנו הודעה למנהל המערכת עם פרטיך.
            </p>
            <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
              ברגע שתאשר תקבל גישה לאפליקציה.
            </p>

            {/* Email badge */}
            {primaryEmail && (
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-6 text-xs"
                style={{
                  background: 'rgba(224,23,107,0.08)',
                  border: '1px solid rgba(224,23,107,0.18)',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                <span style={{ color: '#e0176b' }}>✉</span>
                {primaryEmail}
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              <RefreshButton />
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
                הדף מתרענן אוטומטית כל 30 שניות
              </p>
              <SignOutButton />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
