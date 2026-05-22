'use client'

import type { AnimeSeasonInfo } from '@/app/page'
import type { RelationNode } from '@/lib/anilist'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
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

function isCurrentMonth(d?: RelationNode['startDate']): boolean {
  if (!d?.year || !d?.month) return false
  const now = new Date()
  return d.year === now.getFullYear() && d.month === now.getMonth() + 1
}

type Group = 'watching' | 'releasing' | 'upcoming'

function classify(info: AnimeSeasonInfo | undefined): Group | null {
  if (!info || info.error) return null
  if (info.available !== null) return 'watching'
  if (info.next !== null) {
    if (info.next.status === 'RELEASING' || isCurrentMonth(info.next.startDate)) return 'releasing'
    return 'upcoming'
  }
  return null
}

const GROUP_META: Record<Group, { label: string; icon: string; color: string }> = {
  watching:  { label: 'צופה',                icon: '📺', color: 'text-violet-400' },
  releasing: { label: 'יוצאים פרקים חדשים', icon: '🟢', color: 'text-green-400'  },
  upcoming:  { label: 'הוכרזה עונה',         icon: '📅', color: 'text-amber-400'  },
}

const GROUP_ORDER: Group[] = ['watching', 'releasing', 'upcoming']

export default function CheckUpdatesModal({ tracked, seasonInfo, onClose }: Props) {
  const grouped: Partial<Record<Group, TrackedItem[]>> = {}

  for (const item of tracked) {
    const g = classify(seasonInfo?.[item.anilistId])
    if (!g) continue
    if (!grouped[g]) grouped[g] = []
    grouped[g]!.push(item)
  }

  const total = GROUP_ORDER.reduce((n, g) => n + (grouped[g]?.length ?? 0), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-[#13132a] border border-gray-700 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
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
              const items = grouped[g]
              if (!items || items.length === 0) return null
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
                            <span className="text-sm text-gray-100 truncate">{item.title}</span>
                            {g === 'watching' && info?.available && (
                              <span className="text-xs text-violet-400 truncate">📺 {info.available.title.romaji}</span>
                            )}
                            {g === 'releasing' && (
                              <span className="text-xs text-green-400">🟢 משודר כעת</span>
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
        <div className="px-5 py-4 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}
