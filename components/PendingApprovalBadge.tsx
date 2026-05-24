'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function PendingApprovalBadge({ count }: { count: number }) {
  const router = useRouter()
  const [hovered, setHovered] = useState(false)

  if (count === 0) return null

  return (
    <button
      onClick={() => router.push('/admin')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: hovered ? '#1a1a2e' : '#13131f',
        border: '1px solid rgba(245,158,11,0.45)',
        borderRadius: 14,
        padding: '10px 16px',
        cursor: 'pointer',
        boxShadow: hovered
          ? '0 4px 24px rgba(245,158,11,0.25)'
          : '0 2px 12px rgba(0,0,0,0.4)',
        transition: 'all 0.18s ease',
        color: '#d1ddf9',
        fontFamily: 'system-ui, Arial, sans-serif',
        direction: 'rtl',
      }}
      title="לחץ לניהול בקשות הגישה"
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
  )
}
