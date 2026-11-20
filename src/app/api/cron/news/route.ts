import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { runScheduledArticle } from '@/lib/news/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get('authorization') ?? ''
  const given = Buffer.from(header)
  const want = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

/**
 * Called every 30 minutes by the GitHub Actions workflow `news-schedule.yml` (Vercel Hobby cron
 * only runs daily). Publishes at most one article. `?force=1` skips the "ran recently" guard.
 * Anything other than a clean run returns 200 with a status; only real errors return 5xx.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  try {
    const outcome = await runScheduledArticle({ force: request.nextUrl.searchParams.get('force') === '1' })
    return NextResponse.json(outcome, { status: outcome.status === 'failed' ? 500 : 200 })
  } catch (error) {
    console.error('News schedule error:', error)
    return NextResponse.json({ error: 'The scheduled run failed' }, { status: 500 })
  }
}
