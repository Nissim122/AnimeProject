'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

export interface OnHoldItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  note: string | null
  addedAt: string
}

interface Props {
  items: OnHoldItem[]
  onRemove: (anilistId: number) => void
  onMoveToTracked: (item: OnHoldItem) => void
  onNoteUpdate?: (anilistId: number, note: string) => Promise<void>
}

function cleanSeriesTitle(title: string): string {
  return title
    .replace(/\s+\d+(?:st|nd|rd|th)\s+Season(?:\s+Part\s+\d+)?$/i, '')
    .replace(/\s+(?:Final\s+)?Season(?:\s+\d+)?(?:\s+Part\s+\d+)?$/i, '')
    .replace(/\s+Part\s+\d+$/i, '')
    .trim()
}

function OnHoldCard({
  item,
  onRemove,
  onMoveToTracked,
  onNoteUpdate,
}: {
  item: OnHoldItem
  onRemove: (anilistId: number) => void
  onMoveToTracked: (item: OnHoldItem) => void
  onNoteUpdate?: (anilistId: number, note: string) => Promise<void>
}) {
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
    <div className="bg-gray-800 rounded-xl overflow-hidden flex flex-col border border-yellow-600/40">
      {item.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.coverImage}
          alt={item.title}
          className="w-full aspect-[2/3] object-cover opacity-75"
        />
      ) : (
        <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center text-3xl opacity-75">
          🎌
        </div>
      )}
      <div className="p-2 flex flex-col gap-1.5 flex-1">
        <p className="text-white text-xs font-semibold text-right line-clamp-2">
          {cleanSeriesTitle(item.title)}
        </p>
        <p className="text-yellow-500/70 text-xs text-right">⏸ הושהתה</p>
        <p className="text-gray-500 text-xs text-right">
          {new Date(item.addedAt).toLocaleDateString('he-IL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>

        {/* Note section */}
        {noteOpen ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="הוסף הערה..."
              rows={3}
              className="w-full text-xs bg-gray-700 text-white rounded-lg px-2 py-1.5 resize-none border border-gray-600 focus:border-yellow-500 focus:outline-none placeholder-gray-500"
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

        <div className="mt-auto flex flex-col gap-1">
          <button
            onClick={() => onMoveToTracked(item)}
            className="w-full py-1 text-xs text-white bg-[#e0176b] hover:bg-[#f5257e] rounded transition-colors"
          >
            ▶ חזור למעקב
          </button>
          <button
            onClick={() => onRemove(item.anilistId)}
            className="w-full py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
          >
            הסר
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnHoldView({ items, onRemove, onMoveToTracked, onNoteUpdate }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-4xl mb-3">⏸️</p>
        <p>אין סדרות בהשהייה — לחץ ⏸ על סדרה ברשימת המעקב כדי להעביר אותה לכאן</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {items.map((item) => (
        <OnHoldCard
          key={item.id}
          item={item}
          onRemove={onRemove}
          onMoveToTracked={onMoveToTracked}
          onNoteUpdate={onNoteUpdate}
        />
      ))}
    </div>
  )
}
