import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { sendUserApprovedEmail } from '@/lib/mailer'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nisimelec77@gmail.com'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clerkUser = await currentUser()
  const email =
    clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? ''
  if (email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { targetUserId, action } = (await req.json()) as {
    targetUserId: string
    action: string
  }

  if (!targetUserId || !['APPROVE', 'DENY'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const approval = await prisma.userApproval.findUnique({ where: { clerkUserId: targetUserId } })
  if (!approval) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await prisma.userApproval.update({
    where: { clerkUserId: targetUserId },
    data: { status: action === 'APPROVE' ? 'APPROVED' : 'DENIED' },
  })

  if (action === 'APPROVE') {
    try {
      await sendUserApprovedEmail({
        userEmail: approval.email,
        userName: approval.name || approval.email,
      })
    } catch (e) {
      console.error('Failed to send approval email:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
