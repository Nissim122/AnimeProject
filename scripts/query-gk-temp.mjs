import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const USER_ID = 'user_3E7aAf4SwSwph2xlbKE4svdE3HY'

// ── Faithful port of lib/anilist.ts + app/api/next-seasons/route.ts ──
// (Reimplemented here as plain fetch calls because the real /api/next-seasons
// route requires an authenticated Clerk session, which this script doesn't have.)

let lastCall = 0
async function rl() {
  const wait = lastCall + 750 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCall = Date.now()
}

async function gql(query, variables) {
  await rl()
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return res.json()
}

async function fetchStatusAndSequels(id) {
  const data = await gql(
    `query($id: Int) { Media(id: $id, type: ANIME) { status startDate { year month day }
      relations { edges { relationType node { id format title { romaji } status startDate { year month day } } } } } }`,
    { id }
  )
  const media = data?.data?.Media
  if (!media) return null
  const edges = media.relations?.edges ?? []
  const sequels = edges
    .filter((e) => e.relationType === 'SEQUEL' && (e.node.format === 'TV' || e.node.format === 'TV_SHORT' || e.node.format === 'MOVIE'))
    .map((e) => e.node)
  return { status: media.status, startDate: media.startDate, sequels }
}

function pickUpcoming(sequels) {
  const candidates = sequels.filter((s) => s.status === 'NOT_YET_RELEASED' || s.status === 'RELEASING')
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => {
    const ay = a.startDate.year ?? 9999, by = b.startDate.year ?? 9999
    if (ay !== by) return ay - by
    const am = a.startDate.month ?? 99, bm = b.startDate.month ?? 99
    if (am !== bm) return am - bm
    return (a.startDate.day ?? 99) - (b.startDate.day ?? 99)
  })[0]
}

function pickAvailable(sequels, trackedSet) {
  const finished = sequels.filter((s) => s.status === 'FINISHED' && !trackedSet.has(s.id))
  if (finished.length === 0) return null
  return finished.sort((a, b) => (a.startDate.year ?? 0) - (b.startDate.year ?? 0))[0]
}

async function batchFetchNodes(ids) {
  if (ids.length === 0) return []
  const data = await gql(
    `query($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) {
      id title { romaji english } status seasonYear season format
      relations { edges { relationType node { id format } } } } } }`,
    { ids }
  )
  return data?.data?.Page?.media ?? []
}

async function getAllSeasons(anilistId) {
  const visited = new Set()
  let queue = [anilistId]
  const results = []
  while (queue.length > 0 && visited.size < 20) {
    const batch = queue.splice(0, Math.min(queue.length, 20 - visited.size))
    const toFetch = batch.filter((id) => !visited.has(id))
    if (toFetch.length === 0) continue
    toFetch.forEach((id) => visited.add(id))
    const mediaList = await batchFetchNodes(toFetch)
    for (const media of mediaList) {
      if (['TV', 'TV_SHORT', 'MOVIE', 'ONA'].includes(media.format)) {
        results.push({ id: media.id, title: media.title, status: media.status, seasonYear: media.seasonYear, season: media.season, format: media.format })
      }
      for (const edge of media.relations.edges) {
        const fmt = edge.node.format
        if ((edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL') &&
            (fmt === null || ['TV', 'TV_SHORT', 'MOVIE', 'ONA'].includes(fmt)) &&
            !visited.has(edge.node.id)) {
          queue.push(edge.node.id)
        }
      }
    }
  }
  const SEASON_ORDER = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
  return results.sort((a, b) => {
    const yd = (a.seasonYear ?? 9999) - (b.seasonYear ?? 9999)
    if (yd !== 0) return yd
    const sd = (SEASON_ORDER[a.season ?? ''] ?? 4) - (SEASON_ORDER[b.season ?? ''] ?? 4)
    if (sd !== 0) return sd
    return a.id - b.id
  })
}

// ── Port of the per-id orchestration in app/api/next-seasons/route.ts (lines 57-136) ──
async function computeNextSeasonInfo(id, trackedSet) {
  const statusData = await fetchStatusAndSequels(id)
  if (!statusData) return { next: null, available: null, error: true }
  const { status, startDate, sequels } = statusData

  let next = pickUpcoming(sequels) ?? (status === 'RELEASING' ? { id, format: 'TV', title: { romaji: '' }, status: 'RELEASING', startDate } : null)
  let available = pickAvailable(sequels, trackedSet)

  if (!available) {
    try {
      const allSeasons = await getAllSeasons(id)
      const trackedIdx = allSeasons.findIndex((s) => trackedSet.has(s.id))
      const laterSeasons = trackedIdx >= 0 ? allSeasons.slice(trackedIdx + 1) : []
      const laterUntracked = laterSeasons.filter((s) => !trackedSet.has(s.id))
      const finishedLater = laterUntracked.filter((s) => s.status === 'FINISHED')
      const upcomingLater = laterUntracked.filter((s) => s.status === 'RELEASING' || s.status === 'NOT_YET_RELEASED')
      if (finishedLater.length > 0) {
        const earliest = finishedLater[0]
        available = { id: earliest.id, format: earliest.format, title: { romaji: earliest.title.english ?? earliest.title.romaji }, status: 'FINISHED', startDate: { year: earliest.seasonYear ?? null, month: null, day: null } }
      } else if (!next && upcomingLater.length > 0) {
        const earliest = upcomingLater[0]
        next = { id: earliest.id, format: earliest.format, title: { romaji: earliest.title.english ?? earliest.title.romaji }, status: earliest.status, startDate: { year: earliest.seasonYear ?? null, month: null, day: null } }
      }
    } catch { /* allWatched stays unknown */ }
  }

  return { next, available }
}

// ── categorize() from components/TrackedList.tsx ──
function isCurrentMonth(startDate) {
  if (!startDate?.year || !startDate?.month) return false
  const now = new Date()
  return startDate.year === now.getFullYear() && startDate.month === now.getMonth() + 1
}
function categorize(info, watchStatus) {
  if (!info || info.error) return 'error'
  if (info.available !== null) return 'available'
  if (info.next !== null) {
    if (info.next.status === 'RELEASING' || isCurrentMonth(info.next.startDate)) return 'releasing'
    return 'upcoming'
  }
  if (watchStatus === 'watching') return 'watching'
  return 'completed'
}

// ── CheckUpdatesModal.tsx grouping logic ──
function isReleasing(info) {
  if (!info || info.error) return false
  return info.next !== null && (info.next.status === 'RELEASING' || isCurrentMonth(info.next.startDate))
}
function isUpcoming(info) {
  if (!info || info.error) return false
  return info.next !== null && info.next.status !== 'RELEASING' && !isCurrentMonth(info.next.startDate)
}
function checkUpdatesGroups(info, watchStatus) {
  const groups = []
  if (isReleasing(info)) groups.push('releasing')
  else if (isUpcoming(info)) groups.push('upcoming')
  if (watchStatus === 'watching') groups.push('watching')
  return groups
}

const items = await prisma.trackedAnime.findMany({ where: { userId: USER_ID }, orderBy: { trackedAt: 'desc' } })
console.error(`tracked count: ${items.length}`)
const trackedSet = new Set(items.map((t) => t.anilistId))

const rows = []
for (const item of items) {
  const info = await computeNextSeasonInfo(item.anilistId, trackedSet)
  const trackedListCat = categorize(info, item.watchStatus)
  const checkUpdatesGrp = checkUpdatesGroups(info, item.watchStatus)
  const inCheckUpdatesAtAll = checkUpdatesGrp.length > 0
  rows.push({
    title: item.title,
    anilistId: item.anilistId,
    watchStatus: item.watchStatus,
    available: info.available ? { id: info.available.id, title: info.available.title.romaji } : null,
    next: info.next ? { id: info.next.id, title: info.next.title.romaji, status: info.next.status } : null,
    TrackedList_category: trackedListCat,
    CheckUpdatesModal_groups: checkUpdatesGrp,
    DESYNC: (trackedListCat === 'available' && !checkUpdatesGrp.includes('watching')) ||
            (trackedListCat === 'releasing' && !checkUpdatesGrp.includes('releasing')) ||
            (trackedListCat === 'upcoming' && !checkUpdatesGrp.includes('upcoming')) ||
            (trackedListCat === 'watching' && !checkUpdatesGrp.includes('watching')) ||
            (checkUpdatesGrp.includes('watching') && trackedListCat !== 'watching' && trackedListCat !== 'available'),
  })
  console.error(`  ...${rows.length}/${items.length}`)
}

console.log(JSON.stringify(rows, null, 2))
const desynced = rows.filter((r) => r.DESYNC)
console.error(`\n=== ${desynced.length} desynced items out of ${rows.length} ===`)
for (const d of desynced) console.error(`${d.title} — TrackedList=${d.TrackedList_category} CheckUpdates=[${d.CheckUpdatesModal_groups}] watchStatus=${d.watchStatus}`)

await prisma.$disconnect()
