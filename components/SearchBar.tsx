'use client'

import { useState, useCallback, useRef } from 'react'
import type { AnimeResult } from '@/lib/anilist'
import AnimeCard from './AnimeCard'
import AnimeDetailModal from './AnimeDetailModal'

interface Props {
  onTrack: (anime: AnimeResult, seriesIds?: number[]) => void
  onAddToWatchlist: (anime: AnimeResult) => void
  trackedIds: Set<number>
  watchlistIds: Set<number>
}

export default function SearchBar({ onTrack, onAddToWatchlist, trackedIds, watchlistIds }: Props) {
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

  function handleSubmit() {
    if (timerRef.current) clearTimeout(timerRef.current)
    search(query)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSubmit()
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
      <div className="flex gap-2 max-w-2xl mx-auto">
        <div className="relative flex-1">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="חפש אנימה..."
          className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-pink-500 text-right"
          dir="auto"
        />
        {loading && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400 animate-pulse text-sm">
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
        <button
          onClick={handleSubmit}
          disabled={loading || query.length < 2}
          className="px-5 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors whitespace-nowrap"
        >
          חיפוש
        </button>
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
          onTrack={onTrack}
          onAddToWatchlist={onAddToWatchlist}
          onClose={() => setModalAnime(null)}
        />
      )}
    </div>
  )
}
