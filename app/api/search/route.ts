import { NextRequest, NextResponse } from 'next/server'
import { searchAnime } from '@/lib/anilist'
import { isHebrew, translateHebrewToEnglish, hebrewToKeywords } from '@/lib/translate'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    if (!isHebrew(q)) {
      const results = await searchAnime(q)
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
        // Try all keywords as one combined query first (e.g. "garden eden hell")
        const wordResults = await Promise.all([
          searchAnime(keywords.join(' ')),
          ...keywords.map((kw) => searchAnime(kw)),
        ])
        for (const batch of wordResults) {
          for (const anime of batch) {
            if (!seen.has(anime.id)) {
              seen.add(anime.id)
              results.push(anime)
            }
          }
        }
      }
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[search]', err)
    return NextResponse.json({ error: 'Failed to search AniList' }, { status: 500 })
  }
}
