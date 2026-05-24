'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useClerk } from '@clerk/nextjs'

export function AutoRefresh() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/check-approval', { cache: 'no-store' })
        const data = await res.json()
        if (data.status === 'APPROVED') {
          router.push('/')
        }
      } catch {
        // network error — ignore, try again next tick
      }
    }, 4000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [router])

  return null
}

export function RefreshButton() {
  const router = useRouter()

  async function check() {
    try {
      const res = await fetch('/api/check-approval', { cache: 'no-store' })
      const data = await res.json()
      if (data.status === 'APPROVED') {
        router.push('/')
      }
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={check}
      className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
      style={{
        background: 'rgba(224,23,107,0.15)',
        border: '1px solid rgba(224,23,107,0.35)',
        color: '#e0176b',
      }}
    >
      בדוק שוב
    </button>
  )
}

export function SignOutButton() {
  const { signOut } = useClerk()
  return (
    <button
      onClick={() => signOut({ redirectUrl: '/sign-in' })}
      className="text-sm transition-colors"
      style={{ color: 'rgba(255,255,255,0.3)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
    >
      התנתק
    </button>
  )
}
