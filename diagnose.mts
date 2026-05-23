import { readFileSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { getAnimeStatusWithSequels, getAllSeasons, delay } from './lib/anilist.js'

const envLocal = readFileSync('.env.local', 'utf8')
for (const line of envLocal.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.+)$/)
  if (match) process.env[match[1]] = match[2]
}

const db = new DatabaseSync('C:/Users/nisim/.anime-tracker/anime.db')
const tracked = db.prepare('SELECT * FROM TrackedAnime').all() as Array<{ id: number; anilistId: number; title: string }>
db.close()

const trackedIds = new Set(tracked.map(a => a.anilistId))

for (const anime of tracked) {
  console.log(`\n========== ${anime.title} (${anime.anilistId}) ==========`)
  await delay(800)
  try {
    const { status, sequels } = await getAnimeStatusWithSequels(anime.anilistId)
    console.log(`Self status: ${status}`)
    if (sequels.length > 0) {
      console.log(`Direct sequels from AniList:`)
      for (const s of sequels) {
        const tracked = trackedIds.has(s.id) ? ' [TRACKED]' : ''
        console.log(`  → ${s.title.romaji} (${s.id}) | status=${s.status} | format=${s.format}${tracked}`)
      }
    } else {
      console.log(`Direct sequels: none`)
    }

    console.log(`\nallSeasons BFS result:`)
    const seasons = await getAllSeasons(anime.anilistId)
    for (const s of seasons) {
      const mark = s.id === anime.anilistId ? ' ← TRACKED' : ''
      console.log(`  [${s.id}] "${s.title.english ?? s.title.romaji}" | year=${s.seasonYear} | status=${s.status} | format=${s.format}${mark}`)
    }
  } catch (err) {
    console.error(`  ERROR: ${err}`)
  }
}
