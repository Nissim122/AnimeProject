'use client'

import { useState, useEffect } from 'react'
import type { AnimeResult } from '@/lib/anilist'

interface Props {
  anime: AnimeResult
  trackedIds: Set<number>
  watchlistIds?: Set<number>
  onTrack: (anime: AnimeResult, seriesIds?: number[]) => void
  onAddToWatchlist?: (anime: AnimeResult) => void
  onClose: () => void
}

export default function AnimeDetailModal({ anime, trackedIds, watchlistIds = new Set(), onTrack, onAddToWatchlist, onClose }: Props) {
  const [seasons, setSeasons] = useState<AnimeResult[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [selectedId, setSelectedId] = useState<number>(anime.id)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFetchError(false)
    fetch(`/api/seasons?id=${anime.id}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setSeasons(data.seasons ?? [])
        setSelectedId(anime.id)
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        setFetchError(true)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [anime.id])

  const selectedAnime = seasons.find((s) => s.id === selectedId)
  const alreadyTracked = selectedAnime ? trackedIds.has(selectedAnime.id) : false
  const alreadyInWatchlist = selectedAnime ? watchlistIds.has(selectedAnime.id) : false
  // Any other season in this series that is already tracked (besides the selected one)
  const otherTrackedCount = seasons.filter((s) => s.id !== selectedId && trackedIds.has(s.id)).length

  function handleTrack() {
    if (selectedAnime && !alreadyTracked) {
      onTrack(selectedAnime, seasons.map((s) => s.id))
      onClose()
    }
  }

  function handleAddToWatchlist() {
    if (selectedAnime && !alreadyInWatchlist && onAddToWatchlist) {
      onAddToWatchlist(selectedAnime)
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
                  const isMovie = season.format === 'MOVIE'

                  const tvSeasonNumber = seasons.slice(0, idx + 1).filter(s => s.format !== 'MOVIE').length
                  const prevNonMovies = seasons.slice(0, idx).filter(s => s.format !== 'MOVIE')
                  const allPrevKnown = prevNonMovies.every(s => s.episodes != null)
                  const offset = allPrevKnown
                    ? prevNonMovies.reduce((sum, s) => sum + s.episodes!, 0)
                    : 0
                  const episodeFrom = allPrevKnown ? offset + 1 : 1
                  const episodeTo = !isMovie && season.episodes != null
                    ? (allPrevKnown ? offset + season.episodes : season.episodes)
                    : null

                  return (
                    <button
                      key={season.id}
                      onClick={() => setSelectedId(season.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-right w-full ${
                        isSelected
                          ? 'border-[#e0176b] bg-gray-800'
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
                        <p className="text-white text-sm font-semibold">
                          {isMovie ? 'סרט' : `עונה ${tvSeasonNumber}`}
                        </p>
                        <p className="text-gray-400 text-xs truncate">{title}</p>
                        <div className="flex items-center gap-2 justify-end flex-wrap">
                          {(season.seasonYear ?? season.startDate?.year) && (
                            <p className="text-gray-500 text-xs">{season.seasonYear ?? season.startDate?.year}</p>
                          )}
                          {isMovie ? (
                            season.status === 'RELEASING' ? (
                              <p className="text-green-400 text-xs">יוצא עכשיו</p>
                            ) : season.status === 'NOT_YET_RELEASED' ? (
                              <p className="text-gray-400 text-xs">טרם יצא</p>
                            ) : null
                          ) : season.status === 'RELEASING' ? (
                            <p className="text-green-400 text-xs">ממשיך לצאת...</p>
                          ) : episodeTo != null ? (
                            <p className="text-gray-500 text-xs">
                              פרקים {episodeFrom}–{episodeTo}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        {isTracked && (
                          <span className="text-green-400 text-xs font-medium">✓ במעקב</span>
                        )}
                        {isSelected && (
                          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#e0176b' }} />
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
        <div className="px-4 py-3 border-t border-gray-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="text-gray-400 text-xs sm:text-sm text-right">
            {!loading && selectedIndex >= 0 && (() => {
            const sel = seasons[selectedIndex]
            if (sel?.format === 'MOVIE') return 'נבחר: סרט'
            const tvNum = seasons.slice(0, selectedIndex + 1).filter(s => s.format !== 'MOVIE').length
            return `נבחרה: עונה ${tvNum}`
          })()}
          </p>
          <div className="flex gap-2 justify-end">
            {onAddToWatchlist && (
              <button
                onClick={handleAddToWatchlist}
                disabled={loading || fetchError || !selectedAnime || alreadyInWatchlist}
                className="px-3 py-2 bg-[#d1ddf9] hover:bg-[#bccef5] disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-[#0f0f1a] rounded-lg font-semibold text-xs sm:text-sm transition-colors"
              >
                {alreadyInWatchlist ? '✓ ברשימת צפיה' : '+ לצפייה'}
              </button>
            )}
            <button
              onClick={handleTrack}
              disabled={loading || fetchError || !selectedAnime || alreadyTracked}
              className="px-3 py-2 bg-[#e0176b] hover:bg-[#f5257e] disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-xs sm:text-sm transition-colors"
            >
              {alreadyTracked ? '✓ כבר במעקב' : 'סמן שראיתי עד עונה זו'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
