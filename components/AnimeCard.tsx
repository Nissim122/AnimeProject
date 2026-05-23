'use client'

import type { AnimeResult } from '@/lib/anilist'

interface Props {
  anime: AnimeResult
  isTracked: boolean
  onOpen: () => void
  isTopResult?: boolean
}

export default function AnimeCard({ anime, isTracked, onOpen, isTopResult }: Props) {
  const title = anime.title.english ?? anime.title.romaji
  const year = anime.seasonYear ? ` (${anime.seasonYear})` : ''

  return (
    <div
      onClick={onOpen}
      className={`bg-gray-800 rounded-xl overflow-hidden border transition-colors flex flex-col cursor-pointer group ${
        isTopResult
          ? 'border-yellow-400 hover:border-yellow-300'
          : 'border-gray-700 hover:border-[#e0176b]'
      }`}
    >
      <div className="relative">
        {anime.coverImage?.large && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={anime.coverImage.large}
            alt={title}
            className="w-full object-cover"
            style={{ aspectRatio: '3/4' }}
          />
        )}
        {isTopResult && (
          <span className="absolute top-2 right-2 bg-yellow-400/90 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
            ★ מוביל
          </span>
        )}
        {isTracked && (
          <span className={`absolute ${isTopResult ? 'top-8' : 'top-2'} right-2 bg-green-700/90 text-green-200 text-xs font-medium px-2 py-0.5 rounded-full`}>
            ✓ במעקב
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-white text-sm font-medium leading-tight line-clamp-2">
          {title}{year}
        </p>
        <p className="text-gray-400 text-xs capitalize">{anime.format?.toLowerCase() ?? 'anime'}</p>
        <p className="mt-auto text-[#e0176b] text-xs font-medium group-hover:text-[#f5257e] transition-colors">
          📺 בחר עונה ←
        </p>
      </div>
    </div>
  )
}
