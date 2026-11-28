import { after, NextRequest, NextResponse } from 'next/server'
import { discoverStories } from '@/lib/news/feeds'
import { runScheduledArticle } from '@/lib/news/scheduler'
import { authoriseCron } from '@/lib/news/cronGate'
import { getNewsScheduleEnabled } from '@/lib/settings'
import { runXAlerts } from '@/lib/social/xalertRun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * The breaking watch (owner decision 28 Nov 2026). Meant for an outside cron service every 5 minutes (GitHub's own timer
 * fires only a few times a day, and Vercel Hobby cron is daily): `GET /api/cron/breaking?async=1` with
 * `Authorization: Bearer <CRON_SECRET>`, the same secret the 30-minute news call uses.
 *
 * One read of the trusted feeds, then two things, both only for BREAKING stories (2+ trusted publishers, an urgent headline, fresh):
 *   1. the X alert: one checked line, tweeted at once (lib/social/xalertRun.ts);
 *   2. the fast lane of the news schedule: the article is written, fact-checked and audited, published, and its link goes under
 *      the alert as a reply (lib/news/breaking.ts, lib/social/share.ts).
 * The normal 30-minute flow (`/api/cron/news`) is untouched and keeps publishing the day's ordinary articles. Nothing here
 * runs when the schedule is paused in Admin > News Automation. `?async=1` answers 202 at once and does the work after the
 * response, because outside cron services hang up after 30 seconds and an article takes two minutes.
 */
async function watch() {
  if (!(await getNewsScheduleEnabled())) return { status: 'disabled' as const, message: 'The schedule is paused in Admin → News Automation.', alerts: 'not run' }
  const { stories } = await discoverStories('')
  const alerts = await runXAlerts({ stories })
  if (alerts.ran) console.log('X alerts:', alerts.message)
  const outcome = await runScheduledArticle({ breakingOnly: true, stories })
  console.log('Breaking watch:', outcome.status, outcome.message)
  for (const a of outcome.attempts) console.log(`Breaking attempt [${a.category}] ${a.title.slice(0, 90)} -> ${a.result.slice(0, 300)}`)
  return { ...outcome, alerts: alerts.message }
}

export async function GET(request: NextRequest) {
  const auth = await authoriseCron(request.headers, 'news-schedule.yml')
  if (!auth.ok) {
    console.warn('Breaking watch: request refused —', auth.reason)
    return NextResponse.json({ error: 'Unauthorised', reason: auth.reason }, { status: 401 })
  }
  if (request.nextUrl.searchParams.get('async') === '1') {
    after(async () => {
      try {
        await watch()
      } catch (error) {
        console.error('Breaking watch error (async):', error)
      }
    })
    return NextResponse.json({ accepted: true, async: true }, { status: 202 })
  }
  try {
    const result = await watch()
    return NextResponse.json(result, { status: 'status' in result && result.status === 'failed' ? 500 : 200 })
  } catch (error) {
    console.error('Breaking watch error:', error)
    return NextResponse.json({ error: 'The breaking watch failed' }, { status: 500 })
  }
}

/** Some outside cron services send POST, or are set to it by mistake (same reason as /api/cron/news). */
export const POST = GET
