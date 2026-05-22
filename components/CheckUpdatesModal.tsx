'use client'

import { useState } from 'react'
import type { CheckOnlyResult } from '@/app/api/check-updates/route'

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function formatDate(d: { year: number | null; month: number | null; day: number | null }): string {
  if (!d.year) return 'תאריך לא ידוע'
  if (d.month && d.day) return `${d.day} ${MONTHS_HE[d.month - 1]} ${d.year}`
  if (d.month) return `${MONTHS_HE[d.month - 1]} ${d.year}`
  return String(d.year)
}

interface Props {
  result: CheckOnlyResult
  onClose: () => void
  onEmailSent: (notified: number) => void
}

export default function CheckUpdatesModal({ result, onClose, onEmailSent }: Props) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const hasAnything =
    result.releasingAnimes.length > 0 ||
    result.availableSequels.length > 0 ||
    result.pendingNotifications.length > 0

  const canSendEmail =
    !sent &&
    (result.pendingNotifications.length > 0 || result.availableUnwatched.length > 0)

  async function handleSendEmail() {
    setSending(true)
    try {
      const res = await fetch('/api/send-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pendingNotifications: result.pendingNotifications,
          availableUnwatched: result.availableUnwatched,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSent(true)
        onEmailSent(data.notified ?? 0)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-[#13132a] border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">תוצאות בדיקה</h2>
            <p className="text-gray-400 text-xs mt-0.5">נבדקו {result.checked} אנימות</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-xl leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">
          {!hasAnything && result.pendingNotifications.length === 0 && result.availableUnwatched.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">לא נמצאו עדכונים</p>
          ) : null}

          {/* Currently releasing */}
          {result.releasingAnimes.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                🟢 בשידור עכשיו
                <span className="bg-green-900/50 text-green-400 rounded-full px-2 py-0.5">{result.releasingAnimes.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {result.releasingAnimes.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2">
                    {a.coverImage && (
                      <img src={a.coverImage} alt="" className="w-8 h-11 object-cover rounded" />
                    )}
                    <span className="text-sm text-gray-100">{a.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Available sequels */}
          {result.availableSequels.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-sky-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                📺 המשך זמין לצפייה
                <span className="bg-sky-900/50 text-sky-400 rounded-full px-2 py-0.5">{result.availableSequels.length}</span>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {result.availableSequels.map((a, i) => (
                  <li key={`${a.sequelId}-${i}`} className="bg-gray-800/50 rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-400">{a.parentTitle}</span>
                    <span className="mx-2 text-gray-600">→</span>
                    <span className="text-gray-100">{a.sequelTitle}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Pending email notifications */}
          {result.pendingNotifications.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                🔔 התראות מייל ממתינות
                <span className="bg-amber-900/50 text-amber-400 rounded-full px-2 py-0.5">{result.pendingNotifications.length}</span>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {result.pendingNotifications.map((n, i) => (
                  <li key={`${n.sequelId}-${i}`} className="bg-gray-800/50 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <div>
                      <span className="text-gray-400">{n.animeTitle}</span>
                      <span className="mx-2 text-gray-600">→</span>
                      <span className="text-gray-100">{n.sequelTitle}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${n.type === 'MONTH_START' ? 'bg-pink-900/60 text-pink-300' : 'bg-purple-900/60 text-purple-300'}`}>
                        {n.type === 'MONTH_START' ? 'חודש' : 'מחר'}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(n.startDate)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* No email to send */}
          {result.pendingNotifications.length === 0 && result.availableUnwatched.length === 0 && (
            <p className="text-center text-gray-500 text-xs py-2">אין מיילים לשליחה</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            סגור
          </button>

          {sent ? (
            <span className="text-sm text-green-400 font-medium">✓ המייל נשלח בהצלחה</span>
          ) : (
            <button
              onClick={handleSendEmail}
              disabled={!canSendEmail || sending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white transition-colors"
            >
              {sending ? <span className="animate-spin">⟳</span> : '📧'}
              {sending ? 'שולח...' : 'שלח מייל'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
