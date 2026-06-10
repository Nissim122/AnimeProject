'use client'

import { useState, useCallback, useRef } from 'react'
import type { AnimeResult } from '@/lib/anilist'
import AnimeCard from './AnimeCard'
import AnimeDetailModal from './AnimeDetailModal'

interface Props {
  onTrack: (anime: AnimeResult, seriesIds?: number[]) => void
  onTrackWatching: (anime: AnimeResult, seriesIds?: number[]) => void
  onAddToWatchlist: (anime: AnimeResult) => void
  trackedIds: Set<number>
  watchlistIds: Set<number>
  watchingIds: Set<number>
}

export default function SearchBar({ onTrack, onTrackWatching, onAddToWatchlist, trackedIds, watchlistIds, watchingIds }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AnimeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [modalAnime, setModalAnime] = useState<AnimeResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setSearchError(false); return }

    // Cancel any in-flight request so stale results never overwrite newer ones
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setSearchError(false)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setResults([])
      setSearchError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 700)
  }

  function handleClear() {
    abortRef.current?.abort()
    if (timerRef.current) clearTimeout(timerRef.current)
    setQuery('')
    setResults([])
    setSearchError(false)
    setLoading(false)
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="max-w-2xl mx-auto">
        <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="הזן שם של סדרת האנימה"
          className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-[#e0176b] text-right"
          dir="auto"
        />
        {loading && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#e0176b] animate-pulse text-sm">
            מחפש...
          </span>
        )}
        {query && !loading && (
          <button
            onClick={handleClear}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            aria-label="נקה חיפוש"
          >
            ✕
          </button>
        )}
        </div>
      </div>

      {searchError && (
        <p className="mt-2 text-red-400 text-sm text-right">שגיאה בחיפוש — נסה שוב</p>
      )}

      {results.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...results].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).map((anime, idx) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              isTracked={trackedIds.has(anime.id)}
              onOpen={() => setModalAnime(anime)}
              isTopResult={idx === 0}
            />
          ))}
        </div>
      )}

      {modalAnime && (
        <AnimeDetailModal
          anime={modalAnime}
          trackedIds={trackedIds}
          watchlistIds={watchlistIds}
          watchingIds={watchingIds}
          onTrack={onTrack}
          onTrackWatching={onTrackWatching}
          onAddToWatchlist={onAddToWatchlist}
          onClose={() => setModalAnime(null)}
        />
      )}
    </div>
  )
}
