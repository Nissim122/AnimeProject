import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const approval = await prisma.userApproval.findUnique({
    where: { clerkUserId: userId },
  })

  if (!approval || approval.status !== 'APPROVED') {
    redirect('/pending')
  }

  return <>{children}</>
}
