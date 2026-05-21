'use client'

import { useState, useEffect, useCallback } from 'react'
import SearchBar from '@/components/SearchBar'
import TrackedList from '@/components/TrackedList'
import AnimeDetailModal from '@/components/AnimeDetailModal'
import type { AnimeResult, RelationNode } from '@/lib/anilist'

interface TrackedItem {
  id: number
  anilistId: number
  title: string
  coverImage: string | null
  trackedAt: string
}

interface CheckResult {
  checked?: number
  notified?: number
  notifications?: Array<{ parent: string; sequel: string }>
  error?: string
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
}

let toastId = 0

export default function Home() {
  const [tracked, setTracked] = useState<TrackedItem[]>([])
  const [seasonInfo, setSeasonInfo] = useState<Record<number, AnimeSeasonInfo> | undefined>()
  const [modalAnime, setModalAnime] = useState<AnimeResult | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [checking, setChecking] = useState(false)

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
      if (items.length > 0) {
        const ids = items.map((t) => t.anilistId).join(',')
        fetch(`/api/next-seasons?ids=${ids}`)
          .then((r) => r.json())
          .then((d) => setSeasonInfo(d))
          .catch(() => {})
      } else {
        setSeasonInfo({})
      }
    } catch (err) {
      console.error('[loadTracked]', err)
    }
  }, [])

  useEffect(() => {
    loadTracked()
  }, [loadTracked])

  const trackedIds = new Set(tracked.map((t) => t.anilistId))

  async function handleTrack(anime: AnimeResult, seriesIds?: number[]) {
    if (seriesIds && seriesIds.length > 0) {
      const toRemove = seriesIds.filter((id) => id !== anime.id && trackedIds.has(id))
      await Promise.all(
        toRemove.map((id) => fetch(`/api/track?anilistId=${id}`, { method: 'DELETE' }))
      )
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
      addToast(`✓ ${anime.title.english ?? anime.title.romaji} נוסף למעקב!`, 'success')
      loadTracked()
    } else {
      addToast(data.error ?? 'שגיאה בהוספה', 'error')
    }
  }

  async function handleRemove(anilistId: number) {
    const anime = tracked.find((t) => t.anilistId === anilistId)
    const res = await fetch(`/api/track?anilistId=${anilistId}`, { method: 'DELETE' })
    if (res.ok) {
      addToast(`הוסר: ${anime?.title ?? ''}`, 'info')
      loadTracked()
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

  async function handleCheckUpdates() {
    setChecking(true)
    try {
      const res = await fetch('/api/check-updates', { method: 'POST' })
      const data: CheckResult = await res.json()
      if (data.error) {
        addToast(`שגיאה: ${data.error}`, 'error')
      } else if (data.notified && data.notified > 0) {
        const titles = data.notifications?.map((n) => n.sequel).join(', ')
        addToast(`נמצאו ${data.notified} עונות חדשות! 📧 מייל נשלח: ${titles}`, 'success')
      } else {
        addToast(`נבדקו ${data.checked ?? 0} אנימות — אין עדכונים חדשים`, 'info')
      }
    } catch {
      addToast('בדיקת עדכונים נכשלה', 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-white mb-2">
          🎌 <span className="text-pink-500">Anime Tracker</span>
        </h1>
        <p className="text-gray-400">חפש אנימה, סמן עונות שסיימת, קבל התראה לעונות חדשות</p>
      </div>

      {/* Search */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-3 text-right">🔍 חפש אנימה</h2>
        <SearchBar onTrack={handleTrack} trackedIds={trackedIds} />
      </section>

      {/* Tracked list */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={handleCheckUpdates}
            disabled={checking || tracked.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            {checking ? (
              <span className="animate-spin">⟳</span>
            ) : (
              '🔄'
            )}
            בדוק עדכונים
          </button>
          <h2 className="text-lg font-semibold text-gray-300">
            📋 במעקב ({tracked.length})
          </h2>
        </div>
        <TrackedList
          items={tracked}
          onRemove={handleRemove}
          seasonInfo={seasonInfo}
          onOpenSequel={handleOpenSequel}
          onCardClick={handleCardClick}
        />
      </section>

      {/* Modal for available sequel */}
      {modalAnime && (
        <AnimeDetailModal
          anime={modalAnime}
          trackedIds={trackedIds}
          onTrack={handleTrack}
          onClose={() => setModalAnime(null)}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
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
