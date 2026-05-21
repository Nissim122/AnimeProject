'use client'

import { useState, useCallback, useRef } from 'react'
import type { AnimeResult } from '@/lib/anilist'
import AnimeCard from './AnimeCard'

interface Props {
  onTrack: (anime: AnimeResult) => void
  trackedIds: Set<number>
}

export default function SearchBar({ onTrack, trackedIds }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AnimeResult[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(val), 400)
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="חפש אנימה... (Search anime...)"
          className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:border-pink-500 text-right"
          dir="auto"
        />
        {loading && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400 animate-pulse text-sm">
            מחפש...
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {results.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              isTracked={trackedIds.has(anime.id)}
              onTrack={() => onTrack(anime)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
