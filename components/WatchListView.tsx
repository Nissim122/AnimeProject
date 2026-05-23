'use client'

export interface WatchListItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  addedAt: string
}

interface Props {
  items: WatchListItem[]
  onRemove: (anilistId: number) => void
}

function cleanSeriesTitle(title: string): string {
  return title
    .replace(/\s+\d+(?:st|nd|rd|th)\s+Season(?:\s+Part\s+\d+)?$/i, '')
    .replace(/\s+Season\s+\d+(?:\s+Part\s+\d+)?$/i, '')
    .trim()
}

export default function WatchListView({ items, onRemove }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-4xl mb-3">📋</p>
        <p>רשימת הצפיה ריקה — הוסף אנימות דרך כפתור &quot;+ רשימת צפיה&quot; במודאל</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map((item) => (
        <div key={item.id} className="bg-gray-800 rounded-xl overflow-hidden flex flex-col">
          {item.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.coverImage}
              alt={item.title}
              className="w-full aspect-[2/3] object-cover"
            />
          ) : (
            <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center text-3xl">
              🎌
            </div>
          )}
          <div className="p-2 flex flex-col gap-1 flex-1">
            <p className="text-white text-xs font-semibold text-right line-clamp-2">{cleanSeriesTitle(item.title)}</p>
            <p className="text-gray-500 text-xs text-right">
              {new Date(item.addedAt).toLocaleDateString('he-IL', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <button
              onClick={() => onRemove(item.anilistId)}
              className="mt-auto w-full py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
            >
              הסר
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
