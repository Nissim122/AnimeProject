'use client'

import { useState, useEffect } from 'react'
import type { AnimeSeasonInfo } from '@/app/(app)/page'
import type { RelationNode } from '@/lib/anilist'
import { cleanSeriesTitle } from '@/lib/titleUtils'

interface AiringEp {
  episode: number
  airingAt: number
}

interface AiringScheduleData {
  nextAiringEpisode: AiringEp | null
  upcoming: AiringEp[]
}

function formatAiringDate(airingAt: number): { label: string; color: string } {
  const date = new Date(airingAt * 1000)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === now.toDateString()) return { label: 'היום!', color: 'text-pink-400' }
  if (date.toDateString() === tomorrow.toDateString()) return { label: 'מחר', color: 'text-yellow-400' }
  const label = date.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long' })
  return { label, color: 'text-blue-400' }
}

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  watchStatus: string
  trackedAt: string
}

interface Props {
  tracked: TrackedItem[]
  seasonInfo: Record<number, AnimeSeasonInfo> | undefined
  onClose: () => void
}

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

function formatDate(d: RelationNode['startDate']): string {
  if (!d.year) return 'בקרוב'
  if (d.month && d.day) return `${d.day} ${MONTHS_HE[d.month - 1]} ${d.year}`
  if (d.month) return `${MONTHS_HE[d.month - 1]} ${d.year}`
  return String(d.year)
}

function startDateToSortKey(d: RelationNode['startDate'] | undefined): number {
  if (!d?.year) return Number.MAX_SAFE_INTEGER
  return d.year * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31)
}

function isCurrentMonth(d?: RelationNode['startDate']): boolean {
  if (!d?.year || !d?.month) return false
  const now = new Date()
  return d.year === now.getFullYear() && d.month === now.getMonth() + 1
}

type Group = 'releasing' | 'upcoming' | 'watching'

function isReleasing(info: AnimeSeasonInfo | undefined): boolean {
  if (!info || info.error) return false
  return info.next !== null && (info.next.status === 'RELEASING' || isCurrentMonth(info.next.startDate))
}

function isUpcoming(info: AnimeSeasonInfo | undefined): boolean {
  if (!info || info.error) return false
  return info.next !== null && info.next.status !== 'RELEASING' && !isCurrentMonth(info.next.startDate)
}

const GROUP_META: Record<Group, { label: string; icon: string; color: string }> = {
  releasing: { label: 'בשידור כעת',  icon: '🟢', color: 'text-pink-400'  },
  upcoming:  { label: 'הוכרזה עונה', icon: '📅', color: 'text-amber-400' },
  watching:  { label: 'צופה',        icon: '📺', color: 'text-blue-400'  },
}

const GROUP_ORDER: Group[] = ['releasing', 'upcoming', 'watching']


export default function CheckUpdatesModal({ tracked, seasonInfo, onClose }: Props) {
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'nothing' | 'error'>('idle')
  const [airingMap, setAiringMap] = useState<Record<number, AiringScheduleData | null>>({})

  useEffect(() => {
    const releasingItems = tracked.filter((item) => {
      const info = seasonInfo?.[item.anilistId]
      return classify(info) === 'releasing' && info?.next?.status === 'RELEASING'
    })
    if (releasingItems.length === 0) return

    const controllers: AbortController[] = []
    releasingItems.forEach((item) => {
      const info = seasonInfo![item.anilistId]
      const nextId = info.next!.id
      const ctrl = new AbortController()
      controllers.push(ctrl)
      fetch(`/api/airing-schedule?id=${nextId}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data: AiringScheduleData) =>
          setAiringMap((prev) => ({ ...prev, [item.anilistId]: data }))
        )
        .catch(() => {})
    })
    return () => controllers.forEach((c) => c.abort())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSendEmail() {
    if (emailState === 'sending') return
    setEmailState('sending')

    const watching:  Array<{ parentTitle: string; coverImage?: string; sequelTitle: string }> = []
    const releasing: Array<{ parentTitle: string; coverImage?: string; upcomingEpisodes?: AiringEp[] }> = []
    const upcoming:  Array<{ parentTitle: string; coverImage?: string; startDate: { year: number | null; month: number | null; day: number | null } }> = []

    for (const item of tracked) {
      const info = seasonInfo?.[item.anilistId]
      const title = cleanSeriesTitle(item.title)
      const cover = item.coverImage ?? undefined
      if (info && !info.error) {
        if (isReleasing(info)) {
          releasing.push({
            parentTitle: title,
            coverImage: cover,
            upcomingEpisodes: airingMap[item.anilistId]?.upcoming?.slice(0, 3),
          })
        } else if (isUpcoming(info) && info.next) {
          upcoming.push({ parentTitle: title, coverImage: cover, startDate: info.next.startDate })
        }
      }
      if (item.watchStatus === 'watching') {
        watching.push({
          parentTitle: title,
          coverImage: cover,
          sequelTitle: info?.available?.title.romaji ?? '',
        })
      }
    }

    upcoming.sort((a, b) => startDateToSortKey(a.startDate) - startDateToSortKey(b.startDate))

    if (watching.length === 0 && releasing.length === 0 && upcoming.length === 0) {
      setEmailState('nothing')
      return
    }

    try {
      const res = await fetch('/api/send-update-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watching, releasing, upcoming }),
      })
      const data = await res.json()
      if (!res.ok) { setEmailState('error'); return }
      setEmailState(data.sent ? 'sent' : 'nothing')
    } catch {
      setEmailState('error')
    }
  }

  const grouped: Partial<Record<Group, TrackedItem[]>> = {}

  for (const item of tracked) {
    const info = seasonInfo?.[item.anilistId]
    if (isReleasing(info)) {
      if (!grouped.releasing) grouped.releasing = []
      grouped.releasing.push(item)
    } else if (isUpcoming(info)) {
      if (!grouped.upcoming) grouped.upcoming = []
      grouped.upcoming.push(item)
    }
    if (item.watchStatus === 'watching') {
      if (!grouped.watching) grouped.watching = []
      grouped.watching.push(item)
    }
  }

  const total = (new Set([
    ...(grouped.releasing?.map(i => i.anilistId) ?? []),
    ...(grouped.upcoming?.map(i => i.anilistId) ?? []),
    ...(grouped.watching?.map(i => i.anilistId) ?? []),
  ])).size

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-[#13132a] border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] sm:max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">עדכונים</h2>
            <p className="text-gray-400 text-xs mt-0.5">
              {total > 0 ? `${total} סדרות עם עדכון` : 'אין עדכונים כרגע'}
            </p>
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
          {total === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">לא נמצאו עדכונים</p>
          ) : (
            GROUP_ORDER.map((g) => {
              const rawItems = grouped[g]
              if (!rawItems || rawItems.length === 0) return null
              const items = g === 'upcoming'
                ? [...rawItems].sort((a, b) =>
                    startDateToSortKey(seasonInfo?.[a.anilistId]?.next?.startDate) -
                    startDateToSortKey(seasonInfo?.[b.anilistId]?.next?.startDate)
                  )
                : rawItems
              const { label, icon, color } = GROUP_META[g]
              return (
                <section key={g}>
                  <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${color}`}>
                    {icon} {label}
                    <span className="rounded-full px-2 py-0.5 bg-gray-800">{items.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {items.map((item) => {
                      const info = seasonInfo?.[item.anilistId]
                      return (
                        <li key={item.anilistId} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2">
                          {item.coverImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.coverImage} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
                          )}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm text-gray-100 truncate">{cleanSeriesTitle(item.title)}</span>
                            {g === 'watching' && info?.available && (
                              <span className="text-xs text-blue-400 truncate">📺 {info.available.title.romaji}</span>
                            )}
                            {g === 'releasing' && (
                              <>
                                <span className="text-xs text-green-400">🟢 משודר כעת</span>
                                {airingMap[item.anilistId]?.upcoming?.slice(0, 3).map((ep) => {
                                  const { label, color } = formatAiringDate(ep.airingAt)
                                  return (
                                    <span key={ep.episode} className={`text-xs ${color}`}>
                                      פרק {ep.episode} — {label}
                                    </span>
                                  )
                                })}
                              </>
                            )}
                            {g === 'upcoming' && info?.next && (
                              <span className="text-xs text-amber-400">📅 {formatDate(info.next.startDate)}</span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 shrink-0 flex items-center justify-between gap-2">
          <button
            onClick={handleSendEmail}
            disabled={emailState === 'sending' || emailState === 'sent' || total === 0}
            title="שלח עדכון עונות למייל (תבנית חודשית)"
            className="px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-gray-200 transition-colors"
          >
            {emailState === 'sending' ? '⟳ שולח...' :
             emailState === 'sent'    ? '✓ נשלח' :
             emailState === 'nothing' ? '— אין עדכונים לשליחה' :
             emailState === 'error'   ? '✕ שגיאה' :
             '📧 שלח עדכון במייל'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-xs sm:text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}
