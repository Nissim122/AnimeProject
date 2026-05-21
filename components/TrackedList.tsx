'use client'

import type { RelationNode } from '@/lib/anilist'
import type { AnimeSeasonInfo } from '@/app/page'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  trackedAt: string
}

interface Props {
  items: TrackedItem[]
  onRemove: (anilistId: number) => void
  seasonInfo?: Record<number, AnimeSeasonInfo>
  onOpenSequel?: (sequel: RelationNode) => void
  onCardClick?: (item: TrackedItem) => void
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

type Category = 'available' | 'releasing' | 'upcoming' | 'unknown'

function categorize(anilistId: number, seasonInfo?: Record<number, AnimeSeasonInfo>): Category {
  const info = seasonInfo?.[anilistId]
  if (!info) return 'unknown'

  if (info.available) return 'available'

  const sequel = info.next
  if (!sequel) return 'unknown'

  if (sequel.status === 'RELEASING') return 'releasing'

  const now = new Date()
  const { year, month } = sequel.startDate
  if (year === now.getFullYear() && month === now.getMonth() + 1) return 'releasing'

  return 'upcoming'
}

function AnimeCard({
  item,
  info,
  onRemove,
  onOpenSequel,
  onCardClick,
}: {
  item: TrackedItem
  info: AnimeSeasonInfo | undefined
  onRemove: (id: number) => void
  onOpenSequel?: (sequel: RelationNode) => void
  onCardClick?: (item: TrackedItem) => void
}) {
  const availableSequel = info?.available ?? null
  const nextSequel = info?.next ?? null

  return (
    <div className={`bg-gray-800 rounded-xl overflow-hidden border flex flex-col ${
      availableSequel ? 'border-violet-600' : 'border-gray-700'
    }`}>
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
        {availableSequel && onOpenSequel && (
          <button
            onClick={() => onOpenSequel(availableSequel)}
            className="text-xs bg-violet-700 hover:bg-violet-600 text-white rounded-lg py-1.5 font-medium transition-colors"
          >
            סמן שראיתי
          </button>
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

const SECTION_CONFIG: Record<Category, { label: string; color: string }> = {
  available: { label: '📺 המשך זמין לצפייה', color: 'text-violet-400' },
  releasing: { label: '🟢 יוצא עכשיו',        color: 'text-green-400' },
  upcoming:  { label: '📅 עונה הבאה בדרך',     color: 'text-amber-400' },
  unknown:   { label: '❓ אין מידע על עונה הבאה', color: 'text-gray-400' },
}

const CATEGORY_ORDER: Category[] = ['available', 'releasing', 'upcoming', 'unknown']

export default function TrackedList({ items, onRemove, seasonInfo, onOpenSequel, onCardClick }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        עדיין לא עוקב אחרי אנימות. חפש ולחץ &quot;סיימתי את העונה&quot;!
      </p>
    )
  }

  const groups: Record<Category, TrackedItem[]> = { available: [], releasing: [], upcoming: [], unknown: [] }
  for (const item of items) {
    groups[categorize(item.anilistId, seasonInfo)].push(item)
  }

  return (
    <div className="flex flex-col gap-8">
      {CATEGORY_ORDER.map((cat) => {
        const group = groups[cat]
        if (group.length === 0) return null
        const { label, color } = SECTION_CONFIG[cat]
        return (
          <section key={cat}>
            <h3 className={`text-sm font-semibold mb-3 ${color}`}>{label} ({group.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.map((item) => (
                <AnimeCard
                  key={item.id}
                  item={item}
                  info={seasonInfo?.[item.anilistId]}
                  onRemove={onRemove}
                  onOpenSequel={onOpenSequel}
                  onCardClick={onCardClick}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
