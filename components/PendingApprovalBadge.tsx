'use client'

import { useState } from 'react'

interface PendingUser {
  clerkUserId: string
  email: string
  name: string | null
  createdAt: string
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default function PendingApprovalBadge({ count: initialCount }: { count: number }) {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<PendingUser[]>([])
  const [count, setCount] = useState(initialCount)
  const [fetching, setFetching] = useState(false)
  const [acting, setActing] = useState<string | null>(null) // clerkUserId being processed

  if (count === 0) return null

  async function openModal() {
    setFetching(true)
    setOpen(true)
    try {
      const res = await fetch('/api/admin/pending')
      const data = await res.json()
      setUsers(data.pending ?? [])
      setCount(data.pending?.length ?? 0)
    } finally {
      setFetching(false)
    }
  }

  async function act(userId: string, action: 'APPROVE' | 'DENY') {
    setActing(userId)
    try {
      await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, action }),
      })
      const updated = users.filter((u) => u.clerkUserId !== userId)
      setUsers(updated)
      setCount(updated.length)
    } finally {
      setActing(null)
    }
  }

  return (
    <>
      {/* Floating badge */}
      <button
        onClick={openModal}
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#13131f',
          border: '1px solid rgba(245,158,11,0.45)',
          borderRadius: 14,
          padding: '10px 16px',
          cursor: 'pointer',
          boxShadow: '0 2px 16px rgba(0,0,0,0.45)',
          color: '#d1ddf9',
          fontFamily: 'system-ui, Arial, sans-serif',
          direction: 'rtl',
          transition: 'box-shadow 0.18s, background 0.18s',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = '#1a1a2e'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow =
            '0 4px 24px rgba(245,158,11,0.22)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = '#13131f'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 16px rgba(0,0,0,0.45)'
        }}
      >
        <span style={{ fontSize: 20 }}>🔔</span>
        <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
            {count === 1 ? 'בקשת גישה חדשה' : `${count} בקשות גישה חדשות`}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
            לחץ לאישור / דחייה
          </div>
        </div>
        <span
          style={{
            background: '#f59e0b',
            color: '#0f0f1a',
            borderRadius: '50%',
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-start',
            padding: '0 0 96px 24px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#13131f',
              border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 16,
              padding: 20,
              width: 360,
              maxHeight: '60vh',
              overflowY: 'auto',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              direction: 'rtl',
              fontFamily: 'system-ui, Arial, sans-serif',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 15 }}>
                  בקשות גישה ממתינות
                </div>
                {count > 0 && (
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>
                    {count} בקשות מחכות לאישורך
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: 20,
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            {fetching ? (
              <div
                style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: 14,
                  textAlign: 'center',
                  padding: '20px 0',
                }}
              >
                טוען...
              </div>
            ) : users.length === 0 ? (
              <div
                style={{
                  color: 'rgba(255,255,255,0.28)',
                  fontSize: 14,
                  textAlign: 'center',
                  padding: '20px 0',
                }}
              >
                אין בקשות ממתינות
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {users.map((user) => (
                  <div
                    key={user.clerkUserId}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10,
                      padding: '12px 14px',
                    }}
                  >
                    {/* User info */}
                    <div style={{ marginBottom: 10 }}>
                      {user.name && (
                        <div
                          style={{
                            color: '#d1ddf9',
                            fontWeight: 700,
                            fontSize: 14,
                            marginBottom: 3,
                          }}
                        >
                          {user.name}
                        </div>
                      )}
                      <div
                        style={{
                          color: user.name ? 'rgba(255,255,255,0.5)' : '#d1ddf9',
                          fontSize: 13,
                          fontWeight: user.name ? 400 : 600,
                          wordBreak: 'break-all',
                        }}
                      >
                        {user.email}
                      </div>
                      <div
                        style={{
                          color: 'rgba(255,255,255,0.22)',
                          fontSize: 11,
                          marginTop: 4,
                        }}
                      >
                        {formatDate(user.createdAt)}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => act(user.clerkUserId, 'APPROVE')}
                        disabled={acting !== null}
                        style={{
                          flex: 1,
                          background: 'rgba(52,211,153,0.12)',
                          color: '#34d399',
                          border: '1px solid rgba(52,211,153,0.3)',
                          borderRadius: 8,
                          padding: '7px 0',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: acting !== null ? 'not-allowed' : 'pointer',
                          opacity: acting !== null && acting !== user.clerkUserId ? 0.4 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {acting === user.clerkUserId ? '...' : '✓ אשר'}
                      </button>
                      <button
                        onClick={() => act(user.clerkUserId, 'DENY')}
                        disabled={acting !== null}
                        style={{
                          flex: 1,
                          background: 'rgba(248,113,113,0.1)',
                          color: '#f87171',
                          border: '1px solid rgba(248,113,113,0.25)',
                          borderRadius: 8,
                          padding: '7px 0',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: acting !== null ? 'not-allowed' : 'pointer',
                          opacity: acting !== null && acting !== user.clerkUserId ? 0.4 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {acting === user.clerkUserId ? '...' : '✕ דחה'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
