import { after, NextRequest, NextResponse } from 'next/server'
import { runScheduledArticle } from '@/lib/news/scheduler'
import { authoriseCron } from '@/lib/news/cronGate'
import { runXInbox } from '@/lib/social/xinbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Called every 30 minutes by the GitHub Actions workflow `news-schedule.yml` (Vercel Hobby cron
 * only runs daily). The workflow proves who it is with GitHub's OIDC token. As a second way in, an
 * outside cron service may send `Authorization: Bearer <CRON_SECRET>` (only when that environment
 * variable is set). Publishes at most one article; a run within 20 minutes of the last one does
 * nothing, so two callers cannot double up. `?force=1` skips the "ran recently"
 * guard. `?async=1` returns 202 straight away and runs the article after the response (for callers that
 * hang up after 30 seconds); the result then shows in Admin > News Automation and the function logs. Anything other than a clean run returns 200 with a status; only real errors return 5xx.
 */
export async function GET(request: NextRequest) {
  const auth = await authoriseCron(request.headers, 'news-schedule.yml')
  if (!auth.ok) {
    console.warn('News schedule: request refused —', auth.reason)
    return NextResponse.json({ error: 'Unauthorised', reason: auth.reason }, { status: 401 })
  }
  const force = request.nextUrl.searchParams.get('force') === '1'
  // X answer-back and the reply desk ride on the same 30-minute call. It never throws, has its own 25-minute
  // guard, and runs after the response whatever the article run does.
  after(async () => {
    const inbox = await runXInbox()
    if (inbox.ran) console.log('X inbox:', inbox.message)
  })
  // `?async=1`: answer at once (202) and do the work after the response. Outside cron services give up on a
  // request after 30 seconds, and one article takes two minutes or more; the work still runs to the end.
  if (request.nextUrl.searchParams.get('async') === '1') {
    after(async () => {
      try {
        const outcome = await runScheduledArticle({ force })
        console.log('News schedule (async):', outcome.status, outcome.message)
      } catch (error) {
        console.error('News schedule error (async):', error)
      }
    })
    return NextResponse.json({ accepted: true, async: true }, { status: 202 })
  }
  try {
    const outcome = await runScheduledArticle({ force })
    return NextResponse.json(outcome, { status: outcome.status === 'failed' ? 500 : 200 })
  } catch (error) {
    console.error('News schedule error:', error)
    return NextResponse.json({ error: 'The scheduled run failed' }, { status: 500 })
  }
}

/**
 * Some outside cron services (cron-job.org among them) send POST, or are set to it by mistake, and a
 * route that only exports GET answers those with 405. The same bearer-token check and the same
 * 20-minute guard apply, so accepting POST opens nothing new.
 */
export const POST = GET
