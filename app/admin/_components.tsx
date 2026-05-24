'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ActionButtons({
  userId,
  showApprove,
  showDeny,
}: {
  userId: string
  showApprove: boolean
  showDeny: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<'APPROVE' | 'DENY' | null>(null)

  async function act(action: 'APPROVE' | 'DENY') {
    setLoading(action)
    try {
      await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, action }),
      })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      {showApprove && (
        <button
          onClick={() => act('APPROVE')}
          disabled={loading !== null}
          style={{
            background: 'rgba(52,211,153,0.12)',
            color: '#34d399',
            border: '1px solid rgba(52,211,153,0.3)',
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: loading !== null ? 'not-allowed' : 'pointer',
            opacity: loading !== null && loading !== 'APPROVE' ? 0.4 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {loading === 'APPROVE' ? '...' : 'אשר ✓'}
        </button>
      )}
      {showDeny && (
        <button
          onClick={() => act('DENY')}
          disabled={loading !== null}
          style={{
            background: 'rgba(248,113,113,0.1)',
            color: '#f87171',
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 8,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: loading !== null ? 'not-allowed' : 'pointer',
            opacity: loading !== null && loading !== 'DENY' ? 0.4 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {loading === 'DENY' ? '...' : 'דחה ✕'}
        </button>
      )}
    </div>
  )
}
