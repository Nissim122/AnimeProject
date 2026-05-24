import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ActionButtons } from './_components'

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'nisimelec77@gmail.com').toLowerCase().trim()

type Approval = {
  clerkUserId: string
  email: string
  name: string | null
  status: string
  createdAt: Date
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function Section({
  title,
  count,
  color,
  children,
}: {
  title: string
  count: number
  color: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ color: '#d1ddf9', fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h2>
        <span
          style={{
            background: color + '22',
            color,
            borderRadius: 20,
            padding: '2px 11px',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {count}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function UserCard({
  user,
  showApprove,
  showDeny,
}: {
  user: Approval
  showApprove: boolean
  showDeny: boolean
}) {
  return (
    <div
      style={{
        background: '#13131f',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#d1ddf9', fontWeight: 700, fontSize: 15, marginBottom: 3 }}>
          {user.name || user.email}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{user.email}</div>
        <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 12, marginTop: 3 }}>
          {formatDate(user.createdAt)}
        </div>
      </div>
      <ActionButtons userId={user.clerkUserId} showApprove={showApprove} showDeny={showDeny} />
    </div>
  )
}

export default async function AdminPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const clerkUser = await currentUser()
  const email = (
    clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? ''
  ).toLowerCase().trim()

  if (email !== ADMIN_EMAIL) redirect('/')

  const users = await prisma.userApproval.findMany({ orderBy: { createdAt: 'desc' } })

  const pending = users.filter((u) => u.status === 'PENDING')
  const approved = users.filter((u) => u.status === 'APPROVED' && u.email !== ADMIN_EMAIL)
  const denied = users.filter((u) => u.status === 'DENIED')

  return (
    <div
      style={{
        background: '#0f0f1a',
        minHeight: '100vh',
        padding: '40px 24px',
        direction: 'rtl',
        fontFamily: 'system-ui, Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 44 }}>
          <h1 style={{ color: '#d1ddf9', fontSize: 28, fontWeight: 900, margin: '0 0 6px' }}>
            <span style={{ color: '#e0176b' }}>Admin</span> Panel
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, margin: 0 }}>
            ניהול בקשות גישה למערכת
          </p>
        </div>

        <Section title="ממתין לאישור" count={pending.length} color="#f59e0b">
          {pending.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 14, padding: '8px 0', margin: 0 }}>
              אין בקשות ממתינות
            </p>
          ) : (
            pending.map((u) => (
              <UserCard key={u.clerkUserId} user={u} showApprove showDeny />
            ))
          )}
        </Section>

        <Section title="מאושרים" count={approved.length} color="#34d399">
          {approved.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 14, padding: '8px 0', margin: 0 }}>
              אין משתמשים מאושרים
            </p>
          ) : (
            approved.map((u) => (
              <UserCard key={u.clerkUserId} user={u} showApprove={false} showDeny />
            ))
          )}
        </Section>

        <Section title="נדחו" count={denied.length} color="#f87171">
          {denied.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 14, padding: '8px 0', margin: 0 }}>
              אין משתמשים שנדחו
            </p>
          ) : (
            denied.map((u) => (
              <UserCard key={u.clerkUserId} user={u} showApprove showDeny={false} />
            ))
          )}
        </Section>
      </div>
    </div>
  )
}
