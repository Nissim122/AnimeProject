'use client'

import { useState } from 'react'
import type { RelationNode } from '@/lib/anilist'
import type { AnimeSeasonInfo } from '@/app/page'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  trackedAt: string
}

type Category = 'watching' | 'releasing' | 'upcoming' | 'completed' | 'error'

const CATEGORY_ORDER: Category[] = ['watching', 'releasing', 'upcoming', 'completed', 'error']

const CATEGORY_META: Record<Category, { label: string; icon: string; headerColor: string; borderColor: string }> = {
  watching:  { label: 'צופה',                icon: '📺', headerColor: 'text-violet-400', borderColor: 'border-violet-600' },
  releasing: { label: 'יוצאים פרקים חדשים', icon: '🟢', headerColor: 'text-green-400',  borderColor: 'border-green-500'  },
  upcoming:  { label: 'הוכרזה עונה',         icon: '📅', headerColor: 'text-amber-400',  borderColor: 'border-amber-500'  },
  completed: { label: 'הושלם',               icon: '✅', headerColor: 'text-gray-400',   borderColor: 'border-gray-600'   },
  error:     { label: 'שגיאה בטעינה',        icon: '⚠️', headerColor: 'text-red-400',    borderColor: 'border-red-700'    },
}

interface Props {
  items: TrackedItem[]
  onRemove: (anilistId: number) => void
  seasonInfo?: Record<number, AnimeSeasonInfo>
  seasonInfoLoading?: boolean
  onOpenSequel?: (sequel: RelationNode) => void
  onCardClick?: (item: TrackedItem) => void
  onRefreshCategory?: (anilistIds: number[]) => Promise<void>
}

const MONTHS_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function formatStartDate(d: RelationNode['startDate']): string {
  if (!d.year) return 'בקרוב'
  if (d.month && d.day) return `${d.day} ${MONTHS_HE[d.month - 1]} ${d.year}`
  if (d.month) return `${MONTHS_HE[d.month - 1]} ${d.year}`
  return String(d.year)
}

function isCurrentMonth(startDate?: RelationNode['startDate']): boolean {
  if (!startDate?.year || !startDate?.month) return false
  const now = new Date()
  return startDate.year === now.getFullYear() && startDate.month === (now.getMonth() + 1)
}

function categorize(info: AnimeSeasonInfo | undefined): Category {
  if (!info || info.error) return 'error'
  if (info.available !== null) return 'watching'
  if (info.next !== null) {
    if (info.next.status === 'RELEASING' || isCurrentMonth(info.next.startDate)) return 'releasing'
    return 'upcoming'
  }
  return 'completed'
}

function NextSeasonBadge({ sequel }: { sequel: RelationNode }) {
  const isAiring = sequel.status === 'RELEASING'
  return (
    <p className={`text-xs font-medium ${isAiring ? 'text-green-400' : 'text-amber-400'}`}>
      {isAiring
        ? '🟢 משודר כעת'
        : `📅 עונה הבאה: ${formatStartDate(sequel.startDate)}`}
    </p>
  )
}

function AnimeCard({
  item,
  info,
  category,
  onRemove,
  onCardClick,
}: {
  item: TrackedItem
  info: AnimeSeasonInfo | undefined
  category: Category
  onRemove: (id: number) => void
  onCardClick?: (item: TrackedItem) => void
}) {
  const availableSequel = info?.available ?? null
  const nextSequel = info?.next ?? null
  const { borderColor } = CATEGORY_META[category]

  return (
    <div className={`bg-gray-800 rounded-xl overflow-hidden border flex flex-col ${borderColor}`}>
      <div
        className="relative cursor-pointer group"
        style={{ aspectRatio: '3/4' }}
        onClick={() => onCardClick?.(item)}
        title="לחץ לשינוי עונה"
      >
        {item.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.coverImage}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-500 text-4xl">
            🎌
          </div>
        )}
        {category === 'releasing' && (
          <span className="absolute top-2 right-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full font-bold z-10">
            בשידור
          </span>
        )}
        {category === 'error' && (
          <span className="absolute top-2 right-2 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded-full font-bold z-10">
            שגיאה
          </span>
        )}
        {onCardClick && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
            <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-pink-600 px-2 py-1 rounded-lg">
              שנה עונה
            </span>
          </div>
        )}
      </div>
      <div className="p-2 flex flex-col gap-2 flex-1">
        <p className="text-white text-xs font-medium leading-tight line-clamp-2">{item.title}</p>
        <p className="text-gray-500 text-xs">
          {new Date(item.trackedAt).toLocaleDateString('he-IL')}
        </p>
        {availableSequel ? (
          <p className="text-violet-400 text-xs font-medium leading-tight line-clamp-2">
            📺 {availableSequel.title.romaji}
          </p>
        ) : (
          nextSequel && <NextSeasonBadge sequel={nextSequel} />
        )}
        <button
          onClick={() => onRemove(item.anilistId)}
          className="mt-auto text-xs text-red-400 hover:text-red-300 transition-colors py-1"
        >
          הסר מהרשימה
        </button>
      </div>
    </div>
  )
}

export default function TrackedList({
  items,
  onRemove,
  seasonInfo,
  seasonInfoLoading,
  onCardClick,
  onRefreshCategory,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<Category>>(new Set())
  const [refreshing, setRefreshing] = useState<Set<Category>>(new Set())

  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        עדיין לא עוקב אחרי אנימות. חפש ולחץ &quot;סיימתי את העונה&quot;!
      </p>
    )
  }

  if (seasonInfoLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-gray-500 text-sm justify-end">
          <span className="animate-spin inline-block">⟳</span>
          <span>טוען סטטוסים...</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 opacity-40 pointer-events-none">
          {items.map((item) => (
            <AnimeCard
              key={item.id}
              item={item}
              info={undefined}
              category="completed"
              onRemove={onRemove}
            />
          ))}
        </div>
      </div>
    )
  }

  // Group items by category
  const grouped: Partial<Record<Category, TrackedItem[]>> = {}
  for (const item of items) {
    const cat = categorize(seasonInfo?.[item.anilistId])
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat]!.push(item)
  }

  const activeCategories = CATEGORY_ORDER

  function toggleCollapse(cat: Category) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  async function handleRefresh(cat: Category) {
    if (!onRefreshCategory) return
    const ids = (grouped[cat] ?? []).map((i) => i.anilistId)
    if (ids.length === 0) return
    setRefreshing((prev) => new Set(prev).add(cat))
    try {
      await onRefreshCategory(ids)
    } finally {
      setRefreshing((prev) => {
        const next = new Set(prev)
        next.delete(cat)
        return next
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {activeCategories.map((cat) => {
        const meta = CATEGORY_META[cat]
        const catItems = grouped[cat] ?? []
        const isCollapsed = collapsed.has(cat)
        const isRefreshing = refreshing.has(cat)

        return (
          <section key={cat}>
            <div className="relative flex items-center justify-center mb-4">
              <button
                onClick={() => handleRefresh(cat)}
                disabled={isRefreshing || !onRefreshCategory}
                className="absolute left-0 text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors text-sm px-1"
                title="רענן קטגוריה"
              >
                <span className={isRefreshing ? 'animate-spin inline-block' : ''}>↻</span>
              </button>
              <button
                onClick={() => toggleCollapse(cat)}
                className={`flex items-center gap-3 font-bold text-2xl ${meta.headerColor} hover:opacity-80 transition-opacity`}
              >
                <span className="text-gray-400 text-base">{isCollapsed ? '▸' : '▾'}</span>
                {`${meta.icon} ${meta.label} (${catItems.length})`}
              </button>
            </div>
            {!isCollapsed && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {catItems.map((item) => (
                  <AnimeCard
                    key={item.id}
                    item={item}
                    info={seasonInfo?.[item.anilistId]}
                    category={cat}
                    onRemove={onRemove}
                    onCardClick={onCardClick}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
