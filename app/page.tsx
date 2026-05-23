'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser, UserButton, SignInButton } from '@clerk/nextjs'
import SearchBar from '@/components/SearchBar'
import TrackedList from '@/components/TrackedList'
import WatchListView from '@/components/WatchListView'
import AnimeDetailModal from '@/components/AnimeDetailModal'
import CheckUpdatesModal from '@/components/CheckUpdatesModal'
import type { AnimeResult, RelationNode } from '@/lib/anilist'
import type { WatchListItem } from '@/components/WatchListView'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  trackedAt: string
}


type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

export interface AnimeSeasonInfo {
  next: RelationNode | null
  available: RelationNode | null
  hasReleasingAhead?: boolean
  allWatched?: boolean
  error?: boolean
}

let toastId = 0

type ActiveView = 'tracked' | 'watchlist'

export default function Home() {
  const { user, isLoaded } = useUser()
  const [tracked, setTracked] = useState<TrackedItem[]>([])
  const [watchlist, setWatchlist] = useState<WatchListItem[]>([])
  const [activeView, setActiveView] = useState<ActiveView>('tracked')
  const [seasonInfo, setSeasonInfo] = useState<Record<number, AnimeSeasonInfo> | undefined>({})
  const [modalAnime, setModalAnime] = useState<AnimeResult | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [trackedLoading, setTrackedLoading] = useState(true)
  const [seasonInfoLoading, setSeasonInfoLoading] = useState(true)
  const [showCheckModal, setShowCheckModal] = useState(false)

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  const loadTracked = useCallback(async () => {
    try {
      const res = await fetch('/api/tracked')
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      const items: TrackedItem[] = data.tracked ?? []
      setTracked(items)
      setTrackedLoading(false)
      if (items.length > 0) {
        setSeasonInfoLoading(true)
        const ids = items.map((t) => t.anilistId).join(',')
        fetch(`/api/next-seasons?ids=${ids}`)
          .then((r) => { if (!r.ok) throw new Error(`status ${r.status}`); return r.json() })
          .then((d) => { setSeasonInfo(d); setSeasonInfoLoading(false) })
          .catch(() => { setSeasonInfo(undefined); setSeasonInfoLoading(false) })
      } else {
        setSeasonInfo({})
        setSeasonInfoLoading(false)
      }
    } catch (err) {
      console.error('[loadTracked]', err)
      setTrackedLoading(false)
      setSeasonInfoLoading(false)
    }
  }, [])

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist')
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setWatchlist(data.items ?? [])
    } catch (err) {
      console.error('[loadWatchlist]', err)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadTracked()
      loadWatchlist()
    }
  }, [user, loadTracked, loadWatchlist])

  const trackedIds = new Set(tracked.map((t) => t.anilistId))
  const watchlistIds = new Set(watchlist.map((w) => w.anilistId))

  async function handleTrack(anime: AnimeResult, seriesIds?: number[]) {
    if (seriesIds && seriesIds.length > 0) {
      const toRemove = seriesIds.filter((id) => id !== anime.id && trackedIds.has(id))
      await Promise.all(
        toRemove.map((id) => fetch(`/api/track?anilistId=${id}`, { method: 'DELETE' }))
      )
      if (toRemove.length > 0) {
        setTracked((prev) => prev.filter((t) => !toRemove.includes(t.anilistId)))
        setSeasonInfo((prev) => {
          if (!prev) return prev
          const next = { ...prev }
          toRemove.forEach((id) => delete next[id])
          return next
        })
      }
    }

    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anilistId: anime.id,
        title: anime.title.english ?? anime.title.romaji,
        coverImage: anime.coverImage?.large,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      if (data.message === 'Already tracked') {
        addToast(`${anime.title.english ?? anime.title.romaji} כבר במעקב`, 'info')
        return
      }
      addToast(`✓ ${anime.title.english ?? anime.title.romaji} נוסף למעקב!`, 'success')

      const newItem: TrackedItem = {
        id: data.anime.id,
        anilistId: data.anime.anilistId,
        title: data.anime.title,
        coverImage: data.anime.coverImage ?? null,
        trackedAt: data.anime.trackedAt,
      }

      // Fetch season info for ONLY the new anime, then update both states together
      let newSeasonInfo: Record<number, AnimeSeasonInfo> = {}
      try {
        const r = await fetch(`/api/next-seasons?ids=${anime.id}`)
        if (r.ok) newSeasonInfo = await r.json()
        else newSeasonInfo = { [anime.id]: { next: null, available: null, error: true } }
      } catch {
        newSeasonInfo = { [anime.id]: { next: null, available: null, error: true } }
      }

      setSeasonInfo((prev) => ({ ...(prev ?? {}), ...newSeasonInfo }))
      setTracked((prev) => [newItem, ...prev])
    } else {
      addToast(data.error ?? 'שגיאה בהוספה', 'error')
    }
  }

  async function handleAddToWatchlist(anime: AnimeResult) {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anilistId: anime.id,
        title: anime.title.english ?? anime.title.romaji,
        coverImage: anime.coverImage?.large,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      addToast(`נוסף לרשימת הצפיה: ${anime.title.english ?? anime.title.romaji}`, 'success')
      loadWatchlist()
      setActiveView('watchlist')
    } else {
      addToast(data.error ?? 'שגיאה בהוספה לרשימת הצפיה', 'error')
    }
  }

  async function handleRemoveFromWatchlist(anilistId: number) {
    const item = watchlist.find((w) => w.anilistId === anilistId)
    const res = await fetch(`/api/watchlist?anilistId=${anilistId}`, { method: 'DELETE' })
    if (res.ok) {
      addToast(`הוסר מרשימת הצפיה: ${item?.title ?? ''}`, 'info')
      loadWatchlist()
    } else {
      addToast('שגיאה בהסרה', 'error')
    }
  }

  async function handleRemove(anilistId: number) {
    const anime = tracked.find((t) => t.anilistId === anilistId)
    const res = await fetch(`/api/track?anilistId=${anilistId}`, { method: 'DELETE' })
    if (res.ok) {
      addToast(`הוסר: ${anime?.title ?? ''}`, 'info')
      setTracked((prev) => prev.filter((t) => t.anilistId !== anilistId))
      setSeasonInfo((prev) => {
        if (!prev) return prev
        const next = { ...prev }
        delete next[anilistId]
        return next
      })
    } else {
      addToast('שגיאה בהסרה', 'error')
    }
  }

  function handleCardClick(item: TrackedItem) {
    const fakeAnime: AnimeResult = {
      id: item.anilistId,
      title: { romaji: item.title, english: null },
      coverImage: { large: item.coverImage ?? '' },
      status: 'FINISHED',
      seasonYear: null,
      season: null,
      format: null,
      popularity: null,
      episodes: null,
    }
    setModalAnime(fakeAnime)
  }

  function handleOpenSequel(sequel: RelationNode) {
    const fakeAnime: AnimeResult = {
      id: sequel.id,
      title: { romaji: sequel.title.romaji, english: null },
      coverImage: { large: '' },
      status: sequel.status,
      seasonYear: sequel.startDate.year,
      season: null,
      format: sequel.format,
      popularity: null,
      episodes: null,
    }
    setModalAnime(fakeAnime)
  }

  async function handleRefreshCategory(anilistIds: number[]): Promise<Record<number, AnimeSeasonInfo>> {
    const ids = anilistIds.join(',')
    const allTrackedIds = tracked.map((t) => t.anilistId).join(',')
    try {
      const r = await fetch(`/api/next-seasons?ids=${ids}&allTrackedIds=${allTrackedIds}`)
      if (!r.ok) return {}
      const d: Record<number, AnimeSeasonInfo> = await r.json()
      setSeasonInfo((prev) => prev ? { ...prev, ...d } : d)
      return d
    } catch {
      return {}
    }
  }

  function handleCheckUpdates() {
    setShowCheckModal(true)
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
        <h1
          className="text-3xl sm:text-5xl font-black text-center tracking-tight"
          style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}
        >
          <span className="bg-gradient-to-r from-pink-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(236,72,153,0.45)]">
            Anime Tracker
          </span>
        </h1>
        <p className="text-gray-400/80 text-center text-sm sm:text-base">עקוב אחרי האנימות שלך וקבל התראה כשיוצאת עונה חדשה</p>
        <SignInButton mode="modal">
          <button className="px-8 py-3 bg-gradient-to-r from-pink-600 to-fuchsia-600 hover:from-pink-500 hover:to-fuchsia-500 text-white rounded-xl font-semibold text-lg shadow-[0_4px_20px_rgba(236,72,153,0.35)] hover:shadow-[0_4px_28px_rgba(236,72,153,0.5)] transition-[transform,box-shadow,background] active:scale-95">
            התחבר / הירשם
          </button>
        </SignInButton>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-3 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-10">
        <UserButton />
        <div className="text-center flex-1">
          <h1
            className="text-2xl sm:text-4xl font-black mb-1 sm:mb-2 tracking-tight"
            style={{ fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em' }}
          >
            <span className="bg-gradient-to-r from-pink-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(236,72,153,0.4)]">
              Anime Tracker
            </span>
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm hidden sm:block">חפש אנימה, סמן עונות שסיימת, קבל התראה לעונות חדשות</p>
        </div>
        <div className="w-8" />
      </div>

      {/* Search */}
      <section className="mb-6 sm:mb-10">
        <h2 className="text-base sm:text-lg font-bold text-gray-200 mb-3 text-right flex items-center justify-end gap-2">
          <span>חפש אנימה</span>
          <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-400 to-fuchsia-500 inline-block" />
        </h2>
        <SearchBar
          onTrack={handleTrack}
          onAddToWatchlist={handleAddToWatchlist}
          trackedIds={trackedIds}
          watchlistIds={watchlistIds}
        />
      </section>

      {/* Lists section */}
      <section className="mb-8">
        {/* Tab nav */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <button
            onClick={handleCheckUpdates}
            disabled={tracked.length === 0 || activeView !== 'tracked'}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap"
          >
            🔄 <span className="hidden xs:inline">בדוק </span>עדכונים
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveView('tracked')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                activeView === 'tracked'
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              📋 במעקב ({tracked.length})
            </button>
            <button
              onClick={() => setActiveView('watchlist')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                activeView === 'watchlist'
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              👁 לצפייה ({watchlist.length})
            </button>
          </div>
        </div>

        {activeView === 'tracked' && (
          trackedLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 text-sm">טוען רשימה...</p>
            </div>
          ) : (
            <TrackedList
              items={tracked}
              onRemove={handleRemove}
              seasonInfo={seasonInfo}
              seasonInfoLoading={seasonInfoLoading}
              onOpenSequel={handleOpenSequel}
              onCardClick={handleCardClick}
              onRefreshCategory={handleRefreshCategory}
            />
          )
        )}
        {activeView === 'watchlist' && (
          <WatchListView items={watchlist} onRemove={handleRemoveFromWatchlist} />
        )}
      </section>

      {/* Check updates modal */}
      {showCheckModal && (
        <CheckUpdatesModal
          tracked={tracked}
          seasonInfo={seasonInfo}
          onClose={() => setShowCheckModal(false)}
        />
      )}

      {/* Modal for available sequel */}
      {modalAnime && (
        <AnimeDetailModal
          anime={modalAnime}
          trackedIds={trackedIds}
          watchlistIds={watchlistIds}
          onTrack={handleTrack}
          onAddToWatchlist={handleAddToWatchlist}
          onClose={() => setModalAnime(null)}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 flex flex-col gap-2 z-50 max-w-[calc(100vw-1.5rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-lg text-sm text-white shadow-lg transition-all ${
              t.type === 'success'
                ? 'bg-green-700'
                : t.type === 'error'
                ? 'bg-red-700'
                : 'bg-gray-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </main>
  )
}
