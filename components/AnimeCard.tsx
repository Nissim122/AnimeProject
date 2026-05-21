'use client'

import type { AnimeResult } from '@/lib/anilist'

interface Props {
  anime: AnimeResult
  isTracked: boolean
  onTrack: () => void
}

export default function AnimeCard({ anime, isTracked, onTrack }: Props) {
  const title = anime.title.english ?? anime.title.romaji
  const year = anime.seasonYear ? ` (${anime.seasonYear})` : ''

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-pink-500 transition-colors flex flex-col">
      {anime.coverImage?.medium && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={anime.coverImage.medium}
          alt={title}
          className="w-full object-cover"
          style={{ aspectRatio: '3/4' }}
        />
      )}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-white text-sm font-medium leading-tight line-clamp-2">
          {title}{year}
        </p>
        <p className="text-gray-400 text-xs capitalize">{anime.format?.toLowerCase() ?? 'anime'}</p>
        <button
          onClick={onTrack}
          disabled={isTracked}
          className={`mt-auto py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${
            isTracked
              ? 'bg-green-800 text-green-300 cursor-default'
              : 'bg-pink-600 hover:bg-pink-500 text-white cursor-pointer'
          }`}
        >
          {isTracked ? '✓ במעקב' : '✓ סיימתי את העונה'}
        </button>
      </div>
    </div>
  )
}
