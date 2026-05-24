'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useClerk } from '@clerk/nextjs'

export function AutoRefresh() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      router.refresh()
    }, 30000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [router])

  return null
}

export function RefreshButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.refresh()}
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
