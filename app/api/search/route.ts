import { NextRequest, NextResponse } from 'next/server'
import { searchAnime, type AnimeResult } from '@/lib/anilist'
import { isHebrew, translateHebrewToEnglish, hebrewToKeywords } from '@/lib/translate'

type RawResult = AnimeResult & {
  relations?: { edges: Array<{ relationType: string; node: { id: number } }> }
}

function groupBySeries(results: RawResult[]): AnimeResult[] {
  if (results.length === 0) return []

  const idToIdx = new Map<number, number>()
  results.forEach((a, i) => idToIdx.set(a.id, i))

  const parent = results.map((_, i) => i)
  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x])
    return parent[x]
  }

  for (let i = 0; i < results.length; i++) {
    for (const edge of results[i].relations?.edges ?? []) {
      if (edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL') {
        const j = idToIdx.get(edge.node.id)
        if (j !== undefined) parent[find(i)] = find(j)
      }
    }
  }

  // Pick the first-seen representative per group (preserves relevance order)
  const rootFirst = new Map<number, number>()
  for (let i = 0; i < results.length; i++) {
    const root = find(i)
    if (!rootFirst.has(root)) rootFirst.set(root, i)
  }

  return Array.from(rootFirst.values())
    .sort((a, b) => a - b)
    .map((i) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { relations: _rel, ...clean } = results[i]
      return clean as AnimeResult
    })
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    if (!isHebrew(q)) {
      const results = groupBySeries(await searchAnime(q) as RawResult[])
      return NextResponse.json({ results })
    }

    // 1. Translate the full phrase and search
    let translated = q
    try {
      translated = await translateHebrewToEnglish(q)
    } catch {
      console.warn('[search] translation failed, searching as-is')
    }

    const phraseDiffers = translated.toLowerCase() !== q.toLowerCase()
    const [phraseResults, originalResults] = await Promise.all([
      phraseDiffers ? searchAnime(translated) : Promise.resolve([]),
      searchAnime(q),
    ])

    // Merge phrase + original, deduplicated
    const seen = new Set<number>()
    let results = [...phraseResults, ...originalResults].filter((a) => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })

    // 2. If few results, also try word-by-word keyword search as fallback
    if (results.length < 3 && phraseDiffers) {
      let keywords: string[] = []
      try {
        keywords = await hebrewToKeywords(q)
      } catch {
        console.warn('[search] word-level translation failed')
      }

      if (keywords.length > 0) {
        const kwQueries = [keywords.join(' '), ...keywords]
        for (const kw of kwQueries) {
          const batch = await searchAnime(kw)
          for (const anime of batch) {
            if (!seen.has(anime.id)) {
              seen.add(anime.id)
              results.push(anime)
            }
          }
        }
      }
    }

    return NextResponse.json({ results: groupBySeries(results as RawResult[]) })
  } catch (err) {
    console.error('[search]', err)
    return NextResponse.json({ error: 'Failed to search AniList' }, { status: 500 })
  }
}
