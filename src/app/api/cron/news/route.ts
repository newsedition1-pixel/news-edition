import { after, NextRequest, NextResponse } from 'next/server'
import { runScheduledArticle } from '@/lib/news/scheduler'
import { bearerToken, secretMatches } from '@/lib/news/cronAuth'
import { GITHUB_JWKS_URL, tokenKeyId, verifyGithubOidc, type Jwks, type OidcPolicy } from '@/lib/news/githubOidc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REPOSITORY = 'newsedition1-pixel/news-edition'

/** Only the schedule workflow of this repository, on master, may call this route. */
const POLICY: OidcPolicy = {
  audience: 'https://newsedition.in',
  repository: REPOSITORY,
  workflowRef: `${REPOSITORY}/.github/workflows/news-schedule.yml@refs/heads/master`,
  ref: 'refs/heads/master',
  events: ['schedule', 'workflow_dispatch'],
}

let cachedJwks: { jwks: Jwks; at: number } | null = null

async function loadJwks(force: boolean): Promise<Jwks | null> {
  if (!force && cachedJwks && Date.now() - cachedJwks.at < 60 * 60 * 1000) return cachedJwks.jwks
  try {
    const res = await fetch(GITHUB_JWKS_URL, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return cachedJwks?.jwks ?? null
    const jwks = (await res.json()) as Jwks
    if (!Array.isArray(jwks.keys)) return cachedJwks?.jwks ?? null
    cachedJwks = { jwks, at: Date.now() }
    return jwks
  } catch {
    return cachedJwks?.jwks ?? null
  }
}

async function authorise(request: NextRequest): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = bearerToken(request.headers.get('authorization'))
  if (!token) return { ok: false, reason: 'missing token' }
  // An outside cron service (used when GitHub's timer is late) sends the shared secret.
  if (secretMatches(token, process.env.CRON_SECRET)) return { ok: true }
  let jwks = await loadJwks(false)
  if (!jwks) return { ok: false, reason: 'could not load GitHub signing keys' }
  // GitHub rotates keys now and then: if this token's key is not in the cached set, fetch a fresh one once.
  const kid = tokenKeyId(token)
  if (kid && !jwks.keys.some((k) => k.kid === kid)) jwks = (await loadJwks(true)) ?? jwks
  return verifyGithubOidc(token, jwks, POLICY)
}

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
  const auth = await authorise(request)
  if (!auth.ok) {
    console.warn('News schedule: request refused —', auth.reason)
    return NextResponse.json({ error: 'Unauthorised', reason: auth.reason }, { status: 401 })
  }
  const force = request.nextUrl.searchParams.get('force') === '1'
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
