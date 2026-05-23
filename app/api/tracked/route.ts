import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const tracked = await prisma.trackedAnime.findMany({
      where: { userId },
      orderBy: { trackedAt: 'desc' },
    })
    return NextResponse.json({ tracked })
  } catch (err) {
    console.error('[tracked]', err)
    return NextResponse.json({ error: 'Failed to fetch tracked anime' }, { status: 500 })
  }
}
