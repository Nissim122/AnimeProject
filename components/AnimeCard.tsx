'use client'

import type { AnimeResult } from '@/lib/anilist'

interface Props {
  anime: AnimeResult
  isTracked: boolean
  onOpen: () => void
}

export default function AnimeCard({ anime, isTracked, onOpen }: Props) {
  const title = anime.title.english ?? anime.title.romaji
  const year = anime.seasonYear ? ` (${anime.seasonYear})` : ''

  return (
    <div
      onClick={onOpen}
      className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-pink-500 transition-colors flex flex-col cursor-pointer group"
    >
      <div className="relative">
        {anime.coverImage?.medium && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.coverImage.medium}
            alt={title}
            className="w-full object-cover"
            style={{ aspectRatio: '3/4' }}
          />
        )}
        {isTracked && (
          <span className="absolute top-2 right-2 bg-green-700/90 text-green-200 text-xs font-medium px-2 py-0.5 rounded-full">
            ✓ במעקב
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-white text-sm font-medium leading-tight line-clamp-2">
          {title}{year}
        </p>
        <p className="text-gray-400 text-xs capitalize">{anime.format?.toLowerCase() ?? 'anime'}</p>
        <p className="mt-auto text-pink-400 text-xs font-medium group-hover:text-pink-300 transition-colors">
          📺 בחר עונה ←
        </p>
      </div>
    </div>
  )
}
