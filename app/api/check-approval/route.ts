import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ status: 'UNAUTHENTICATED' })

  const approval = await prisma.userApproval.findUnique({
    where: { clerkUserId: userId },
    select: { status: true },
  })

  return NextResponse.json({ status: approval?.status ?? 'NONE' })
}
