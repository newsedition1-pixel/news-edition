import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { setSetting, NEWS_SCHEDULE_KEY } from '@/lib/settings'
import { getScheduleStatus } from '@/lib/news/scheduler'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireAdmin()
    return NextResponse.json(await getScheduleStatus())
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) throw error
    console.error('Schedule status error:', error)
    return NextResponse.json({ error: 'Failed to load the schedule' }, { status: 500 })
  }
}

/** Pause or resume the 30-minute schedule. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown }
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 })
    await setSetting(NEWS_SCHEDULE_KEY, String(body.enabled))
    return NextResponse.json(await getScheduleStatus())
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) throw error
    console.error('Schedule update error:', error)
    return NextResponse.json({ error: 'Failed to update the schedule' }, { status: 500 })
  }
}
