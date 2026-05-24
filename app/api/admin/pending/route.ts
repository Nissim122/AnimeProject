import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nisimelec77@gmail.com').toLowerCase().trim()

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clerkUser = await currentUser()
  const email = (
    clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    ''
  ).toLowerCase().trim()

  if (email !== ADMIN_EMAIL) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const pending = await prisma.userApproval.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { clerkUserId: true, email: true, name: true, createdAt: true },
  })

  return NextResponse.json({ pending })
}
