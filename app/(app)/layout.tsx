import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nisimelec77@gmail.com').toLowerCase().trim()

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  const clerkUser = await currentUser()
  const email = (
    clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    ''
  ).toLowerCase().trim()

  if (email === ADMIN_EMAIL) {
    return <>{children}</>
  }

  const approval = await prisma.userApproval.findUnique({
    where: { clerkUserId: userId },
  })

  if (!approval || approval.status !== 'APPROVED') {
    redirect('/pending')
  }

  return <>{children}</>
}
