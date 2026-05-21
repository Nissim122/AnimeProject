'use client'

import { useState, useEffect } from 'react'
import type { AnimeResult } from '@/lib/anilist'

interface Props {
  anime: AnimeResult
  trackedIds: Set<number>
  onTrack: (anime: AnimeResult, seriesIds?: number[]) => void
  onClose: () => void
}

export default function AnimeDetailModal({ anime, trackedIds, onTrack, onClose }: Props) {
  const [seasons, setSeasons] = useState<AnimeResult[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [selectedId, setSelectedId] = useState<number>(anime.id)

  useEffect(() => {
    setLoading(true)
    setFetchError(false)
    fetch(`/api/seasons?id=${anime.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setSeasons(data.seasons ?? [])
        setSelectedId(anime.id)
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false))
  }, [anime.id])

  const selectedAnime = seasons.find((s) => s.id === selectedId)
  const alreadyTracked = selectedAnime ? trackedIds.has(selectedAnime.id) : false
  // Any other season in this series that is already tracked (besides the selected one)
  const otherTrackedCount = seasons.filter((s) => s.id !== selectedId && trackedIds.has(s.id)).length

  function handleTrack() {
    if (selectedAnime && !alreadyTracked) {
      onTrack(selectedAnime, seasons.map((s) => s.id))
      onClose()
    }
  }

  const selectedIndex = seasons.findIndex((s) => s.id === selectedId)

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col border border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
            aria-label="סגור"
          >
            ✕
          </button>
          <h2 className="text-white font-bold text-base text-right leading-tight">
            {anime.title.english ?? anime.title.romaji}
          </h2>
        </div>

        {/* Season list */}
        <div className="overflow-y-auto flex-1 p-4">
          {loading && (
            <p className="text-center text-gray-400 py-12 animate-pulse">טוען עונות...</p>
          )}
          {fetchError && (
            <p className="text-center text-red-400 py-12">שגיאה בטעינת העונות — נסה שוב</p>
          )}
          {!loading && !fetchError && seasons.length === 0 && (
            <p className="text-center text-gray-400 py-12">לא נמצאו עונות</p>
          )}
          {!loading && !fetchError && seasons.length > 0 && (
            <>
              <p className="text-gray-400 text-xs text-right mb-3">לחץ על עונה לבחירה</p>
              {otherTrackedCount > 0 && (
                <p className="text-amber-400 text-xs text-right mb-3">
                  ⚠️ עונה אחרת מהסדרה כבר במעקב — תוחלף בבחירה החדשה
                </p>
              )}
              <div className="flex flex-col gap-2">
                {seasons.map((season, idx) => {
                  const title = season.title.english ?? season.title.romaji
                  const isSelected = season.id === selectedId
                  const isTracked = trackedIds.has(season.id)

                  return (
                    <button
                      key={season.id}
                      onClick={() => setSelectedId(season.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-right w-full ${
                        isSelected
                          ? 'border-pink-500 bg-gray-800'
                          : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
                      }`}
                    >
                      {season.coverImage?.large ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={season.coverImage.large}
                          alt={title}
                          className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-gray-700 rounded-lg flex-shrink-0 flex items-center justify-center text-lg">
                          🎌
                        </div>
                      )}
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-white text-sm font-semibold">עונה {idx + 1}</p>
                        <p className="text-gray-400 text-xs truncate">{title}</p>
                        <div className="flex items-center gap-2 justify-end flex-wrap">
                          {season.seasonYear && (
                            <p className="text-gray-500 text-xs">{season.seasonYear}</p>
                          )}
                          {season.episodes != null && (
                            <p className="text-gray-500 text-xs">
                              פרקים 1–{season.episodes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        {isTracked && (
                          <span className="text-green-400 text-xs font-medium">✓ במעקב</span>
                        )}
                        {isSelected && (
                          <span className="w-3 h-3 rounded-full bg-pink-500 inline-block" />
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-between gap-3">
          <p className="text-gray-400 text-sm">
            {!loading && selectedIndex >= 0 && `נבחרה: עונה ${selectedIndex + 1}`}
          </p>
          <button
            onClick={handleTrack}
            disabled={loading || fetchError || !selectedAnime || alreadyTracked}
            className="px-5 py-2 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-sm transition-colors"
          >
            {alreadyTracked ? '✓ כבר במעקב' : 'סמן שראיתי עד עונה זו'}
          </button>
        </div>
      </div>
    </div>
  )
}
