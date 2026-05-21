'use client'

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
}

export default function TrackedList({ items, onRemove }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-gray-500 text-center py-8">
        עדיין לא עוקב אחרי אנימות. חפש ולחץ &quot;סיימתי את העונה&quot;!
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 flex flex-col"
        >
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
            <button
              onClick={() => onRemove(item.anilistId)}
              className="mt-auto text-xs text-red-400 hover:text-red-300 transition-colors py-1"
            >
              הסר מהרשימה
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
