import { NextRequest, NextResponse } from 'next/server'

const ANILIST_URL = 'https://graphql.anilist.co'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 })
  }

  const query = `
    query AiringSchedule($id: Int) {
      Media(id: $id, type: ANIME) {
        status
        nextAiringEpisode { episode airingAt }
        airingSchedule(notYetAired: true) {
          nodes { episode airingAt }
        }
      }
    }
  `

  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { id: parseInt(id) } }),
    })

    if (!res.ok) throw new Error(`AniList ${res.status}`)
    const data = await res.json()
    const media = data?.data?.Media

    if (!media) return NextResponse.json({ upcoming: [], nextAiringEpisode: null })

    const upcoming: Array<{ episode: number; airingAt: number }> =
      (media.airingSchedule?.nodes ?? []).sort(
        (a: { episode: number }, b: { episode: number }) => a.episode - b.episode
      )

    return NextResponse.json({
      status: media.status,
      nextAiringEpisode: media.nextAiringEpisode ?? null,
      upcoming,
    })
  } catch {
    return NextResponse.json({ upcoming: [], nextAiringEpisode: null }, { status: 500 })
  }
}
