import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const tracked = await prisma.trackedAnime.findMany({
      orderBy: { trackedAt: 'desc' },
    })
    return NextResponse.json({ tracked })
  } catch (err) {
    console.error('[tracked]', err)
    return NextResponse.json({ error: 'Failed to fetch tracked anime' }, { status: 500 })
  }
}
