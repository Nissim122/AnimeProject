'use client'

import type { RelationNode } from '@/lib/anilist'
import type { AnimeSeasonInfo } from '@/app/page'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  trackedAt: string
  watchedEpisodes: number
  totalEpisodes: number | null
}

interface Props {
  items: TrackedItem[]
  onRemove: (anilistId: number) => void
  seasonInfo?: Record<number, AnimeSeasonInfo>
  onOpenSequel?: (sequel: RelationNode) => void
  onCardClick?: (item: TrackedItem) => void
  onUpdateEpisodes?: (anilistId: number, watched: number) => void
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

type Category = 'behind' | 'available' | 'releasing' | 'upcoming' | 'unknown'

function categorize(anilistId: number, seasonInfo?: Record<number, AnimeSeasonInfo>): Category {
  const info = seasonInfo?.[anilistId]
  if (!info) return 'unknown'

  if (info.available) {
    // Has unfinished seasons to watch — and something is ALSO releasing right now
    return info.hasReleasingAhead ? 'behind' : 'available'
  }

  const sequel = info.next
  if (!sequel) return 'unknown'

  if (sequel.status === 'RELEASING') return 'releasing'

  const now = new Date()
  const { year, month } = sequel.startDate
  if (year === now.getFullYear() && month === now.getMonth() + 1) return 'releasing'

  return 'upcoming'
}

function EpisodeProgress({
  watched,
  total,
  anilistId,
  onUpdate,
}: {
  watched: number
  total: number | null
  anilistId: number
  onUpdate: (anilistId: number, n: number) => void
}) {
  const pct = total && total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(anilistId, Math.max(0, watched - 1)) }}
          className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-white text-xs leading-none"
        >−</button>
        <span className="text-gray-400 text-xs tabular-nums">
          {watched}{total != null ? ` / ${total}` : ''} פרקים
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(anilistId, total != null ? Math.min(total, watched + 1) : watched + 1) }}
          className="w-5 h-5 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-white text-xs leading-none"
        >+</button>
      </div>
      {pct != null && (
        <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-pink-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

function AnimeCard({
  item,
  info,
  onRemove,
  onOpenSequel,
  onCardClick,
  onUpdateEpisodes,
}: {
  item: TrackedItem
  info: AnimeSeasonInfo | undefined
  onRemove: (id: number) => void
  onOpenSequel?: (sequel: RelationNode) => void
  onCardClick?: (item: TrackedItem) => void
  onUpdateEpisodes?: (anilistId: number, watched: number) => void
}) {
  const availableSequel = info?.available ?? null
  const nextSequel = info?.next ?? null
  const isReleasing = !availableSequel && nextSequel?.status === 'RELEASING'

  return (
    <div className={`bg-gray-800 rounded-xl overflow-hidden border flex flex-col ${
      availableSequel
        ? (info?.hasReleasingAhead ? 'border-orange-500' : 'border-violet-600')
        : isReleasing
        ? 'border-green-500'
        : 'border-gray-700'
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
        {isReleasing && (
          <span className="absolute top-2 right-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full font-bold z-10">
            בשידור
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
        {onUpdateEpisodes && (
          <EpisodeProgress
            watched={item.watchedEpisodes}
            total={item.totalEpisodes}
            anilistId={item.anilistId}
            onUpdate={onUpdateEpisodes}
          />
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
  releasing: { label: '🟢 בשידור עכשיו',                  color: 'text-green-400' },
  behind:    { label: '⏩ עדיין לא הדבקתי — משודר כעת!', color: 'text-orange-400' },
  available: { label: '📺 המשך זמין לצפייה',             color: 'text-violet-400' },
  upcoming:  { label: '📅 עונה הבאה בדרך',               color: 'text-amber-400' },
  unknown:   { label: '❓ אין מידע על עונה הבאה',         color: 'text-gray-400' },
}

const CATEGORY_ORDER: Category[] = ['releasing', 'behind', 'available', 'upcoming', 'unknown']

export default function TrackedList({ items, onRemove, seasonInfo, onOpenSequel, onCardClick, onUpdateEpisodes }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        עדיין לא עוקב אחרי אנימות. חפש ולחץ &quot;סיימתי את העונה&quot;!
      </p>
    )
  }

  const groups: Record<Category, TrackedItem[]> = { behind: [], available: [], releasing: [], upcoming: [], unknown: [] }
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
                  onUpdateEpisodes={onUpdateEpisodes}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
