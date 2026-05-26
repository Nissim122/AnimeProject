'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { RelationNode } from '@/lib/anilist'
import type { AnimeSeasonInfo } from '@/app/(app)/page'
import { cleanSeriesTitle } from '@/lib/titleUtils'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  note: string | null
  trackedAt: string
}

export type Category = 'watching' | 'releasing' | 'upcoming' | 'completed' | 'error'

const CATEGORY_ORDER: Category[] = ['watching', 'releasing', 'upcoming', 'completed', 'error']

const CATEGORY_META: Record<Category, { label: string; icon: string; headerColor: string; borderColor: string }> = {
  watching:  { label: 'צופה',                icon: '📺', headerColor: 'text-[#d1ddf9]',  borderColor: 'border-[#d1ddf9]/40' },
  releasing: { label: 'יוצאים פרקים חדשים', icon: '🟢', headerColor: 'text-green-400',  borderColor: 'border-green-500'  },
  upcoming:  { label: 'הוכרזה עונה',         icon: '📅', headerColor: 'text-amber-400',  borderColor: 'border-amber-500'  },
  completed: { label: 'הושלם',               icon: '✅', headerColor: 'text-gray-400',   borderColor: 'border-gray-600'   },
  error:     { label: 'שגיאה בטעינה',        icon: '⚠️', headerColor: 'text-red-400',    borderColor: 'border-red-700'    },
}

interface Props {
  items: TrackedItem[]
  onRemove: (anilistId: number) => void
  onNoteUpdate?: (anilistId: number, note: string) => Promise<void>
  seasonInfo?: Record<number, AnimeSeasonInfo>
  seasonInfoLoading?: boolean
  onOpenSequel?: (sequel: RelationNode) => void
  onCardClick?: (item: TrackedItem) => void
  onRefreshCategory?: (anilistIds: number[]) => Promise<Record<number, AnimeSeasonInfo>>
  checkingUpdates?: boolean
  filterCategories?: Category[]
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
  isRefreshing,
  onRemove,
  onCardClick,
  onNoteUpdate,
}: {
  item: TrackedItem
  info: AnimeSeasonInfo | undefined
  category: Category
  isRefreshing?: boolean
  onRemove: (id: number) => void
  onCardClick?: (item: TrackedItem) => void
  onNoteUpdate?: (anilistId: number, note: string) => Promise<void>
}) {
  const availableSequel = info?.available ?? null
  const nextSequel = info?.next ?? null
  const { borderColor } = CATEGORY_META[category]
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState(item.note ?? '')
  const [noteSaving, setNoteSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNoteText(item.note ?? '')
  }, [item.note])

  useEffect(() => {
    if (noteOpen) textareaRef.current?.focus()
  }, [noteOpen])

  const saveNote = useCallback(async () => {
    if (!onNoteUpdate) return
    setNoteSaving(true)
    await onNoteUpdate(item.anilistId, noteText)
    setNoteSaving(false)
    setNoteOpen(false)
  }, [onNoteUpdate, item.anilistId, noteText])

  return (
    <div className={`bg-gray-800 rounded-xl overflow-hidden border flex flex-col ${borderColor} ${isRefreshing ? 'opacity-60' : ''}`}>
      <div
        className="relative cursor-pointer group"
        style={{ aspectRatio: '3/4' }}
        onClick={() => !isRefreshing && onCardClick?.(item)}
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
        {category === 'releasing' && !isRefreshing && (
          <span className="absolute top-2 right-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full font-bold z-10">
            בשידור
          </span>
        )}
        {category === 'error' && !isRefreshing && (
          <span className="absolute top-2 right-2 bg-red-700 text-white text-xs px-1.5 py-0.5 rounded-full font-bold z-10">
            שגיאה
          </span>
        )}
        {isRefreshing && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!isRefreshing && onCardClick && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
            <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-[#e0176b] px-2 py-1 rounded-lg">
              שנה עונה
            </span>
          </div>
        )}
      </div>
      <div className="p-2 flex flex-col gap-2 flex-1">
        <p className="text-white text-xs font-medium leading-tight line-clamp-2">{cleanSeriesTitle(item.title)}</p>
        <p className="text-gray-500 text-xs">
          {new Date(item.trackedAt).toLocaleDateString('he-IL')}
        </p>
        {availableSequel ? (
          <p className="text-[#d1ddf9] text-xs font-medium leading-tight line-clamp-2">
            📺 {availableSequel.title.romaji}
          </p>
        ) : (
          nextSequel && <NextSeasonBadge sequel={nextSequel} />
        )}

        <div className="mt-auto flex flex-col gap-1.5">
          {/* Note section */}
          {noteOpen ? (
            <div className="flex flex-col gap-1.5">
              <textarea
                ref={textareaRef}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="הוסף הערה..."
                rows={3}
                className="w-full text-xs bg-gray-700 text-white rounded-lg px-2 py-1.5 resize-none border border-gray-600 focus:border-[#e0176b] focus:outline-none placeholder-gray-500"
              />
              <div className="flex gap-1">
                <button
                  onClick={saveNote}
                  disabled={noteSaving}
                  className="flex-1 text-xs bg-[#e0176b] hover:bg-[#f5257e] disabled:opacity-50 text-white rounded-lg py-1 transition-colors"
                >
                  {noteSaving ? '...' : 'שמור'}
                </button>
                <button
                  onClick={() => { setNoteText(item.note ?? ''); setNoteOpen(false) }}
                  className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg py-1 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNoteOpen(true)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 bg-gray-700/50 hover:bg-gray-700 rounded-lg px-2 py-1.5 transition-colors w-full border border-gray-600/40 hover:border-gray-500"
              title="הוסף הערה"
            >
              <span>✏️</span>
              <span className="truncate">{item.note ? item.note : 'הוסף הערה'}</span>
            </button>
          )}

          <button
            onClick={() => onRemove(item.anilistId)}
            disabled={isRefreshing}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors py-1"
          >
            הסר מהרשימה
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TrackedList({
  items,
  onRemove,
  onNoteUpdate,
  seasonInfo,
  seasonInfoLoading,
  onCardClick,
  onRefreshCategory,
  checkingUpdates,
  filterCategories,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<Category>>(new Set())
  const [refreshing, setRefreshing] = useState<Set<Category>>(new Set())
  const [stableCategories, setStableCategories] = useState<Record<number, Category>>({})
  const initialized = useRef(false)

  useEffect(() => {
    if (seasonInfoLoading || seasonInfo === undefined) return

    if (!initialized.current) {
      initialized.current = true
      const cats: Record<number, Category> = {}
      for (const item of items) {
        cats[item.anilistId] = categorize(seasonInfo[item.anilistId])
      }
      setStableCategories(cats)
      return
    }

    // After initialization: only categorize newly added items.
    // Existing items keep their stable category until explicitly refreshed.
    setStableCategories((prev) => {
      const newItems = items.filter((item) => !(item.anilistId in prev))
      if (newItems.length === 0) return prev
      const next = { ...prev }
      for (const item of newItems) {
        next[item.anilistId] = categorize(seasonInfo[item.anilistId])
      }
      return next
    })
  }, [seasonInfoLoading, seasonInfo, items])

  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        עדיין לא עוקב אחרי אנימות. חפש ולחץ &quot;סיימתי את העונה&quot;!
      </p>
    )
  }

  if (seasonInfoLoading || checkingUpdates) {
    const loadingLabel = checkingUpdates ? 'בודק עדכונים...' : 'טוען סטטוסים...'
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-gray-500 text-sm justify-end">
          <span className="animate-spin inline-block">⟳</span>
          <span>{loadingLabel}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((item) => (
            <AnimeCard
              key={item.id}
              item={item}
              info={undefined}
              category="completed"
              isRefreshing={true}
              onRemove={onRemove}
              onNoteUpdate={onNoteUpdate}
            />
          ))}
        </div>
      </div>
    )
  }

  // Group items by category — use stableCategories so only refreshed items move categories
  const grouped: Partial<Record<Category, TrackedItem[]>> = {}
  for (const item of items) {
    const cat = initialized.current
      ? (stableCategories[item.anilistId] ?? 'error')
      : categorize(seasonInfo?.[item.anilistId])
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat]!.push(item)
  }

  const activeCategories = filterCategories
    ? CATEGORY_ORDER.filter((c) => filterCategories.includes(c))
    : CATEGORY_ORDER

  if (filterCategories && !activeCategories.some((cat) => (grouped[cat] ?? []).length > 0)) {
    return <p className="text-gray-400 text-sm text-center py-8">לא נמצאו עדכונים</p>
  }

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
    const catIds = (grouped[cat] ?? []).map((i) => i.anilistId)
    if (catIds.length === 0) return
    setRefreshing((prev) => new Set(prev).add(cat))
    try {
      // Clear cache for this category's IDs, fetch fresh data for ALL series,
      // then re-sort every item — mirrors the weekly automatic refresh.
      const newInfo = await onRefreshCategory(catIds)
      setStableCategories((prev) => {
        const next = { ...prev }
        for (const item of items) {
          if (item.anilistId in newInfo) {
            next[item.anilistId] = categorize(newInfo[item.anilistId])
          }
        }
        return next
      })
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
        if (catItems.length === 0) return null
        const isCollapsed = collapsed.has(cat)
        const isRefreshing = refreshing.has(cat)

        return (
          <section key={cat}>
            <div className="relative flex items-center justify-center mb-4">
              <button
                onClick={() => handleRefresh(cat)}
                disabled={isRefreshing || !onRefreshCategory}
                className="absolute left-0 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-all text-xs sm:text-sm font-medium border border-gray-600 hover:border-gray-400"
                title="רענן קטגוריה"
              >
                <span className={isRefreshing ? 'animate-spin inline-block text-sm' : 'text-sm'}>↻</span>
                <span className="hidden sm:inline">רענן</span>
              </button>
              <button
                onClick={() => toggleCollapse(cat)}
                className={`flex items-center gap-2 font-bold text-lg sm:text-2xl ${meta.headerColor} hover:opacity-80 transition-opacity`}
              >
                {`${meta.icon} ${meta.label} (${catItems.length})`}
                <span
                  className={`text-base sm:text-xl transition-transform duration-200 inline-block ${meta.headerColor}`}
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                >▾</span>
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
                    isRefreshing={isRefreshing}
                    onRemove={onRemove}
                    onCardClick={onCardClick}
                    onNoteUpdate={onNoteUpdate}
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
