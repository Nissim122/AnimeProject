'use client'

import { useState, useEffect, useCallback } from 'react'
import { useUser, UserButton, SignInButton } from '@clerk/nextjs'
import SearchBar from '@/components/SearchBar'
import TrackedList from '@/components/TrackedList'
import WatchListView from '@/components/WatchListView'
import OnHoldView from '@/components/OnHoldView'
import AnimeDetailModal from '@/components/AnimeDetailModal'
import CheckUpdatesModal from '@/components/CheckUpdatesModal'
import type { AnimeResult, RelationNode } from '@/lib/anilist'
import type { WatchListItem } from '@/components/WatchListView'
import type { OnHoldItem } from '@/components/OnHoldView'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  note: string | null
  watchStatus: string
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

type ActiveView = 'tracked' | 'watchlist' | 'onhold'

export default function Home() {
  const { user, isLoaded } = useUser()
  const [tracked, setTracked] = useState<TrackedItem[]>([])
  const [watchlist, setWatchlist] = useState<WatchListItem[]>([])
  const [onHold, setOnHold] = useState<OnHoldItem[]>([])
  const [activeView, setActiveView] = useState<ActiveView>('tracked')
  const [seasonInfo, setSeasonInfo] = useState<Record<number, AnimeSeasonInfo> | undefined>({})
  const [modalAnime, setModalAnime] = useState<AnimeResult | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [trackedLoading, setTrackedLoading] = useState(true)
  const [seasonInfoLoading, setSeasonInfoLoading] = useState(true)
  const [showCheckModal, setShowCheckModal] = useState(false)
  const [watchlistModalItem, setWatchlistModalItem] = useState<WatchListItem | null>(null)
  const [onHoldModalItem, setOnHoldModalItem] = useState<OnHoldItem | null>(null)

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

  const loadOnHold = useCallback(async () => {
    try {
      const res = await fetch('/api/onhold')
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setOnHold(data.items ?? [])
    } catch (err) {
      console.error('[loadOnHold]', err)
    }
  }, [])

  useEffect(() => {
    if (user) {
      loadTracked()
      loadWatchlist()
      loadOnHold()
    }
  }, [user, loadTracked, loadWatchlist, loadOnHold])

  const trackedIds = new Set(tracked.map((t) => t.anilistId))
  const watchlistIds = new Set(watchlist.map((w) => w.anilistId))
  const onHoldIds = new Set(onHold.map((o) => o.anilistId))
  const watchingIds = new Set(tracked.filter((t) => t.watchStatus === 'watching').map((t) => t.anilistId))

  async function handleTrack(anime: AnimeResult, seriesIds?: number[]): Promise<boolean> {
    const toRemove = seriesIds
      ? seriesIds.filter((id) => id !== anime.id && trackedIds.has(id))
      : []
    if (toRemove.length > 0) {
      const deleteResults = await Promise.all(
        toRemove.map((id) => fetch(`/api/track?anilistId=${id}`, { method: 'DELETE' }))
      )
      if (!deleteResults.every((r) => r.ok)) {
        addToast('שגיאה בהסרת עונה קודמת — נסה שוב', 'error')
        await loadTracked()
        return false
      }
      setTracked((prev) => prev.filter((t) => !toRemove.includes(t.anilistId)))
      setSeasonInfo((prev) => {
        if (!prev) return prev
        const next = { ...prev }
        toRemove.forEach((id) => delete next[id])
        return next
      })
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
        return false
      }
      addToast(`✓ ${anime.title.english ?? anime.title.romaji} נוסף למעקב!`, 'success')

      const newItem: TrackedItem = {
        id: data.anime.id,
        anilistId: data.anime.anilistId,
        title: data.anime.title,
        coverImage: data.anime.coverImage ?? null,
        note: data.anime.note ?? null,
        watchStatus: data.anime.watchStatus ?? 'completed',
        trackedAt: data.anime.trackedAt,
      }

      const allTrackedAfterChange = tracked
        .filter((t) => !toRemove.includes(t.anilistId))
        .map((t) => t.anilistId)
      const allTrackedIds = [...allTrackedAfterChange, anime.id]
      let newSeasonInfo: Record<number, AnimeSeasonInfo> = {}
      try {
        const r = await fetch(
          `/api/next-seasons?ids=${anime.id}&allTrackedIds=${allTrackedIds.join(',')}`
        )
        if (r.ok) newSeasonInfo = await r.json()
        else newSeasonInfo = { [anime.id]: { next: null, available: null, error: true } }
      } catch {
        newSeasonInfo = { [anime.id]: { next: null, available: null, error: true } }
      }

      setSeasonInfo((prev) => ({ ...(prev ?? {}), ...newSeasonInfo }))
      setTracked((prev) => [newItem, ...prev])
      setWatchlist((prev) => prev.filter((w) => w.anilistId !== anime.id))
      return true
    } else {
      addToast(data.error ?? 'שגיאה בהוספה', 'error')
      return false
    }
  }

  async function handleTrackWatching(anime: AnimeResult, seriesIds?: number[]) {
    const toRemove = seriesIds
      ? seriesIds.filter((id) => id !== anime.id && trackedIds.has(id))
      : []
    if (toRemove.length > 0) {
      const deleteResults = await Promise.all(
        toRemove.map((id) => fetch(`/api/track?anilistId=${id}`, { method: 'DELETE' }))
      )
      if (!deleteResults.every((r) => r.ok)) {
        addToast('שגיאה בהסרת עונה קודמת — נסה שוב', 'error')
        await loadTracked()
        return
      }
      setTracked((prev) => prev.filter((t) => !toRemove.includes(t.anilistId)))
      setSeasonInfo((prev) => {
        if (!prev) return prev
        const next = { ...prev }
        toRemove.forEach((id) => delete next[id])
        return next
      })
    }

    const res = await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anilistId: anime.id,
        title: anime.title.english ?? anime.title.romaji,
        coverImage: anime.coverImage?.large,
        watchStatus: 'watching',
      }),
    })
    const data = await res.json()
    if (res.ok) {
      if (data.message === 'Already tracked') {
        addToast(`${anime.title.english ?? anime.title.romaji} כבר במעקב`, 'info')
        return
      }
      addToast(`📺 ${anime.title.english ?? anime.title.romaji} — צופה כרגע`, 'success')

      const newItem: TrackedItem = {
        id: data.anime.id,
        anilistId: data.anime.anilistId,
        title: data.anime.title,
        coverImage: data.anime.coverImage ?? null,
        note: data.anime.note ?? null,
        watchStatus: 'watching',
        trackedAt: data.anime.trackedAt,
      }

      const allTrackedAfterChange = tracked
        .filter((t) => !toRemove.includes(t.anilistId))
        .map((t) => t.anilistId)
      const allTrackedIds = [...allTrackedAfterChange, anime.id]
      let newSeasonInfo: Record<number, AnimeSeasonInfo> = {}
      try {
        const r = await fetch(`/api/next-seasons?ids=${anime.id}&allTrackedIds=${allTrackedIds.join(',')}`)
        if (r.ok) newSeasonInfo = await r.json()
        else newSeasonInfo = { [anime.id]: { next: null, available: null, error: true } }
      } catch {
        newSeasonInfo = { [anime.id]: { next: null, available: null, error: true } }
      }

      setSeasonInfo((prev) => ({ ...(prev ?? {}), ...newSeasonInfo }))
      setTracked((prev) => [newItem, ...prev])
      setWatchlist((prev) => prev.filter((w) => w.anilistId !== anime.id))
    } else {
      addToast(data.error ?? 'שגיאה בהוספה', 'error')
    }
  }

  async function handleMarkCompleted(anilistId: number) {
    const res = await fetch('/api/track', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anilistId, watchStatus: 'completed' }),
    })
    if (res.ok) {
      setTracked((prev) =>
        prev.map((t) => (t.anilistId === anilistId ? { ...t, watchStatus: 'completed' } : t))
      )
      addToast('✅ הסדרה סומנה כהושלמה', 'success')
    } else {
      addToast('שגיאה בעדכון סטטוס', 'error')
    }
  }

  function handleMoveToTracked(item: WatchListItem) {
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
    setWatchlistModalItem(item)
    setModalAnime(fakeAnime)
  }

  async function handleTrackFromWatchlist(anime: AnimeResult, seriesIds?: number[]) {
    const success = await handleTrack(anime, seriesIds)
    if (success && watchlistModalItem) {
      const anilistId = watchlistModalItem.anilistId
      const res = await fetch(`/api/watchlist?anilistId=${anilistId}`, { method: 'DELETE' })
      if (res.ok) {
        setWatchlist((prev) => prev.filter((w) => w.anilistId !== anilistId))
      }
      setActiveView('tracked')
    }
  }

  async function handleTrackFromOnHold(anime: AnimeResult, seriesIds?: number[]) {
    const success = await handleTrack(anime, seriesIds)
    if (success && onHoldModalItem) {
      const { anilistId, note } = onHoldModalItem
      const [deleteRes] = await Promise.all([
        fetch(`/api/onhold?anilistId=${anilistId}`, { method: 'DELETE' }),
      ])
      if (deleteRes.ok) {
        setOnHold((prev) => prev.filter((o) => o.anilistId !== anilistId))
      }
      if (note?.trim()) {
        const patchRes = await fetch('/api/track', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anilistId: anime.id, note }),
        })
        if (patchRes.ok) {
          setTracked((prev) =>
            prev.map((t) => (t.anilistId === anime.id ? { ...t, note } : t))
          )
        }
      }
      setActiveView('tracked')
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

  async function handleMoveToOnHold(item: TrackedItem) {
    const res = await fetch('/api/onhold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anilistId: item.anilistId, title: item.title, coverImage: item.coverImage, note: item.note }),
    })
    const data = await res.json()
    if (res.ok) {
      await fetch(`/api/track?anilistId=${item.anilistId}`, { method: 'DELETE' })
      setTracked((prev) => prev.filter((t) => t.anilistId !== item.anilistId))
      setSeasonInfo((prev) => {
        if (!prev) return prev
        const next = { ...prev }
        delete next[item.anilistId]
        return next
      })
      setOnHold((prev) => [data.item, ...prev.filter((o) => o.anilistId !== item.anilistId)])
      addToast(`⏸ ${item.title} הועברה להשהייה`, 'info')
      setActiveView('onhold')
    } else {
      addToast('שגיאה בהעברה להשהייה', 'error')
    }
  }

  async function handleRestoreFromOnHold(item: OnHoldItem) {
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
    setOnHoldModalItem(item)
    setModalAnime(fakeAnime)
  }

  async function handleRemoveFromOnHold(anilistId: number) {
    const item = onHold.find((o) => o.anilistId === anilistId)
    const res = await fetch(`/api/onhold?anilistId=${anilistId}`, { method: 'DELETE' })
    if (res.ok) {
      addToast(`הוסר מהשהייה: ${item?.title ?? ''}`, 'info')
      setOnHold((prev) => prev.filter((o) => o.anilistId !== anilistId))
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

  async function handleRefreshCategory(categoryIds: number[]): Promise<Record<number, AnimeSeasonInfo>> {
    const ids = categoryIds.join(',')
    const allTrackedIds = tracked.map((t) => t.anilistId).join(',')
    try {
      const r = await fetch(`/api/next-seasons?ids=${ids}&allTrackedIds=${allTrackedIds}&clearCache=${ids}`)
      if (!r.ok) return {}
      const d: Record<number, AnimeSeasonInfo> = await r.json()
      setSeasonInfo((prev) => ({ ...(prev ?? {}), ...d }))
      return d
    } catch {
      return {}
    }
  }

  async function handleNoteUpdate(anilistId: number, note: string) {
    const res = await fetch('/api/track', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anilistId, note }),
    })
    if (res.ok) {
      setTracked((prev) =>
        prev.map((t) => (t.anilistId === anilistId ? { ...t, note: note.trim() || null } : t))
      )
    }
  }

  async function handleOnHoldNoteUpdate(anilistId: number, note: string) {
    const res = await fetch('/api/onhold', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anilistId, note }),
    })
    if (res.ok) {
      setOnHold((prev) =>
        prev.map((o) => (o.anilistId === anilistId ? { ...o, note: note.trim() || null } : o))
      )
    }
  }

  function handleCheckUpdates() {
    setShowCheckModal(true)
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0176b', borderTopColor: 'transparent' }} />
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
          <span style={{ color: '#e0176b', textShadow: '0 0 24px rgba(224,23,107,0.45)' }}>Anime</span>
          {' '}
          <span style={{ color: '#d1ddf9', textShadow: '0 0 24px rgba(209,221,249,0.3)' }}>Tracker</span>
        </h1>
        <p className="text-[#d1ddf9]/60 text-center text-sm sm:text-base">עקוב אחרי האנימות שלך וקבל התראה כשיוצאת עונה חדשה</p>
        <SignInButton mode="modal">
          <button className="px-8 py-3 bg-[#e0176b] hover:bg-[#f5257e] text-white rounded-xl font-semibold text-lg shadow-[0_4px_20px_rgba(224,23,107,0.35)] hover:shadow-[0_4px_28px_rgba(224,23,107,0.5)] transition-[transform,box-shadow,background-color] active:scale-95">
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
            <span style={{ color: '#e0176b', textShadow: '0 0 20px rgba(224,23,107,0.4)' }}>Anime</span>
            {' '}
            <span style={{ color: '#d1ddf9', textShadow: '0 0 20px rgba(209,221,249,0.25)' }}>Tracker</span>
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm hidden sm:block">חפש אנימה, סמן עונות שסיימת, קבל התראה לעונות חדשות</p>
        </div>
        <div className="w-8" />
      </div>

      {/* Search */}
      <section className="mb-6 sm:mb-10">
        <SearchBar
          onTrack={handleTrack}
          onTrackWatching={handleTrackWatching}
          onAddToWatchlist={handleAddToWatchlist}
          trackedIds={trackedIds}
          watchlistIds={watchlistIds}
          watchingIds={watchingIds}
        />
      </section>

      {/* Lists section */}
      <section className="mb-8">
        {/* Tab nav */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <button
            onClick={handleCheckUpdates}
            disabled={tracked.length === 0 || activeView !== 'tracked'}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#e0176b] hover:bg-[#f5257e] disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg text-xs sm:text-sm font-medium shadow-[0_2px_12px_rgba(224,23,107,0.35)] disabled:shadow-none transition-[transform,box-shadow,background-color] active:scale-95 whitespace-nowrap"
          >
            🔄 <span className="hidden xs:inline">בדוק </span>עדכונים
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveView('tracked')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-[transform,box-shadow,background] active:scale-95 ${
                activeView === 'tracked'
                  ? 'bg-[#e0176b] text-white shadow-[0_2px_14px_rgba(224,23,107,0.4)]'
                  : 'bg-[#1a1a2e] text-[#d1ddf9]/50 border border-[#d1ddf9]/10 hover:text-[#d1ddf9]/80 hover:border-[#d1ddf9]/20'
              }`}
            >
              📋 במעקב ({tracked.length})
            </button>
            <button
              onClick={() => setActiveView('watchlist')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-[transform,box-shadow,background] active:scale-95 ${
                activeView === 'watchlist'
                  ? 'bg-[#d1ddf9] text-[#0f0f1a] shadow-[0_2px_14px_rgba(209,221,249,0.3)]'
                  : 'bg-[#1a1a2e] text-[#d1ddf9]/50 border border-[#d1ddf9]/10 hover:text-[#d1ddf9]/80 hover:border-[#d1ddf9]/20'
              }`}
            >
              👁 לצפייה ({watchlist.length})
            </button>
            <button
              onClick={() => setActiveView('onhold')}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-[transform,box-shadow,background] active:scale-95 ${
                activeView === 'onhold'
                  ? 'bg-yellow-500 text-[#0f0f1a] shadow-[0_2px_14px_rgba(234,179,8,0.3)]'
                  : 'bg-[#1a1a2e] text-[#d1ddf9]/50 border border-[#d1ddf9]/10 hover:text-[#d1ddf9]/80 hover:border-[#d1ddf9]/20'
              }`}
            >
              השהייה ({onHold.length})
            </button>
          </div>
        </div>
        {activeView === 'tracked' && (
          trackedLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#e0176b', borderTopColor: 'transparent' }} />
              <p className="text-gray-400 text-sm">טוען רשימה...</p>
            </div>
          ) : (
            <TrackedList
              items={tracked}
              onRemove={handleRemove}
              onNoteUpdate={handleNoteUpdate}
              onMoveToOnHold={handleMoveToOnHold}
              seasonInfo={seasonInfo}
              seasonInfoLoading={seasonInfoLoading}
              onOpenSequel={handleOpenSequel}
              onCardClick={handleCardClick}
              onRefreshCategory={handleRefreshCategory}
            />
          )
        )}
        {activeView === 'watchlist' && (
          <WatchListView items={watchlist} onRemove={handleRemoveFromWatchlist} onMoveToTracked={handleMoveToTracked} />
        )}
        {activeView === 'onhold' && (
          <OnHoldView items={onHold} onRemove={handleRemoveFromOnHold} onMoveToTracked={handleRestoreFromOnHold} onNoteUpdate={handleOnHoldNoteUpdate} />
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

      {/* Modal for available sequel / move-from-watchlist */}
      {modalAnime && (
        <AnimeDetailModal
          anime={modalAnime}
          trackedIds={trackedIds}
          watchlistIds={watchlistIds}
          watchingIds={watchingIds}
          onTrack={watchlistModalItem ? handleTrackFromWatchlist : onHoldModalItem ? handleTrackFromOnHold : handleTrack}
          onTrackWatching={(watchlistModalItem || onHoldModalItem) ? undefined : handleTrackWatching}
          onMarkCompleted={(watchlistModalItem || onHoldModalItem) ? undefined : handleMarkCompleted}
          onAddToWatchlist={(watchlistModalItem || onHoldModalItem) ? undefined : handleAddToWatchlist}
          onClose={() => { setModalAnime(null); setWatchlistModalItem(null); setOnHoldModalItem(null) }}
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
