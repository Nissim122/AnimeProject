'use client'

import type { RelationNode } from '@/lib/anilist'

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
  nextSeasons?: Record<number, RelationNode | null>
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

type Category = 'releasing' | 'upcoming' | 'unknown'

function categorize(anilistId: number, nextSeasons?: Record<number, RelationNode | null>): Category {
  const sequel = nextSeasons?.[anilistId]
  if (!sequel) return 'unknown'

  if (sequel.status === 'RELEASING') return 'releasing'

  const now = new Date()
  const { year, month } = sequel.startDate
  if (year === now.getFullYear() && month === now.getMonth() + 1) return 'releasing'

  if (year) return 'upcoming'
  return 'unknown'
}

function AnimeCard({ item, sequel, onRemove }: { item: TrackedItem; sequel: RelationNode | null | undefined; onRemove: (id: number) => void }) {
  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 flex flex-col">
      {item.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImage}
          alt={item.title}
          className="w-full object-cover"
          style={{ aspectRatio: '3/4' }}
        />
      ) : (
        <div
          className="w-full bg-gray-700 flex items-center justify-center text-gray-500 text-4xl"
          style={{ aspectRatio: '3/4' }}
        >
          🎌
        </div>
      )}
      <div className="p-2 flex flex-col gap-2 flex-1">
        <p className="text-white text-xs font-medium leading-tight line-clamp-2">{item.title}</p>
        <p className="text-gray-500 text-xs">
          {new Date(item.trackedAt).toLocaleDateString('he-IL')}
        </p>
        {sequel && <NextSeasonBadge sequel={sequel} />}
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
  releasing: { label: '🟢 יוצא עכשיו', color: 'text-green-400' },
  upcoming:  { label: '📅 עונה הבאה בדרך', color: 'text-amber-400' },
  unknown:   { label: '❓ אין מידע על עונה הבאה', color: 'text-gray-400' },
}

const CATEGORY_ORDER: Category[] = ['releasing', 'upcoming', 'unknown']

export default function TrackedList({ items, onRemove, nextSeasons }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        עדיין לא עוקב אחרי אנימות. חפש ולחץ &quot;סיימתי את העונה&quot;!
      </p>
    )
  }

  const groups: Record<Category, TrackedItem[]> = { releasing: [], upcoming: [], unknown: [] }
  for (const item of items) {
    groups[categorize(item.anilistId, nextSeasons)].push(item)
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
                  sequel={nextSeasons?.[item.anilistId]}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
